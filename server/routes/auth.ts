import type { Express, Request, Response } from "express";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import * as storage from "../storage";
import { generateToken, requireAuth, authRateLimit, forgotPasswordRateLimit, forgotPasswordOtpRateLimit } from "./middleware";
import { sendOtpEmail, sendPasswordResetOtpEmail } from "../email";
import { pool } from "../db";

function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createTrustedDevice(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashDeviceToken(token);
  await pool.query(
    `INSERT INTO trusted_devices (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + interval '30 days')`,
    [userId, tokenHash]
  );
  return token;
}

async function verifyTrustedDevice(userId: string, token: string): Promise<boolean> {
  const tokenHash = hashDeviceToken(token);
  const { rows } = await pool.query(
    `SELECT id FROM trusted_devices WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()`,
    [userId, tokenHash]
  );
  return rows.length > 0;
}

const registerSchema = z.object({
  email: z.string().email("Invalid email address").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  countryCode: z.string().max(5).optional(),
  phoneNumber: z.string().max(20).optional(),
  whatsappOptIn: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password required"),
});

const onboardingSchema = z.object({
  identity: z.string().max(100).optional().default(""),
  gender: z.string().max(50).optional().default(""),
});

const profileSchema = z.object({
  identity: z.string().max(100).optional(),
  gender: z.string().max(50).optional(),
  tonePreference: z.string().max(50).optional(),
  compass: z.string().max(100).optional(),
  profilePhoto: z.string().max(2_000_000).optional(),
  language: z.enum(["en", "hi"]).optional(),
});

const ALLOWED_SECURITY_QUESTIONS = [
  "What was the name of your first pet?",
  "What is your mother's maiden name?",
  "What was the name of your first school?",
  "What city were you born in?",
  "What was your childhood nickname?",
  "What is the name of the street you grew up on?",
] as const;

function formatUser(user: NonNullable<Awaited<ReturnType<typeof storage.getUserById>>>) {
  return {
    id: user.id,
    email: user.email,
    identity: user.identity,
    uniqueTag: user.uniqueTag ?? null,
    gender: user.gender,
    tonePreference: user.tonePreference,
    compass: user.compass,
    isOnboarded: user.isOnboarded,
    profilePhoto: user.profilePhoto ?? "",
    countryCode: user.countryCode ?? null,
    phoneNumber: user.phoneNumber ?? null,
    whatsappOptIn: user.whatsappOptIn ?? false,
    isTwoFactorEnabled: user.isTwoFactorEnabled ?? false,
    language: user.language ?? "en",
  };
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", authRateLimit, async (req: Request, res: Response) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
      const { email, password, countryCode, phoneNumber, whatsappOptIn } = parsed.data;
      const existing = await storage.getUserByEmail(email.toLowerCase());
      if (existing) {
        return res.status(409).json({ message: "Email already registered" });
      }
      if (phoneNumber) {
        const phoneOwner = await storage.getUserByPhone(phoneNumber);
        if (phoneOwner) {
          return res.status(409).json({ message: "This WhatsApp number is already registered to another account.", code: "PHONE_IN_USE" });
        }
      }
      const user = await storage.createUser(email.toLowerCase(), password);
      req.session.userId = user.id;
      req.userId = user.id;
      if (phoneNumber) {
        await storage.updatePhone(user.id, {
          countryCode: countryCode || null,
          phoneNumber,
          whatsappOptIn: !!whatsappOptIn,
        });
      }
      const token = await generateToken(user.id);
      const freshUser = await storage.getUserById(user.id);
      const u = freshUser || user;
      return res.json({ ...formatUser(u), token });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", authRateLimit, async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
      const { email, password } = parsed.data;
      const { user, emailNotFound } = await storage.verifyPassword(email.toLowerCase(), password);
      if (!user) {
        if (emailNotFound) {
          return res.status(404).json({ message: "No account found with that email.", code: "EMAIL_NOT_FOUND" });
        }
        return res.status(401).json({ message: "Incorrect password." });
      }
      if (user.isTwoFactorEnabled) {
        const { deviceToken } = req.body;
        if (deviceToken && typeof deviceToken === "string") {
          const trusted = await verifyTrustedDevice(user.id, deviceToken);
          if (trusted) {
            req.session.userId = user.id;
            req.userId = user.id;
            const token = await generateToken(user.id);
            return res.json({ ...formatUser(user), token });
          }
        }
        const code = await storage.createLoginOtp(user.id);
        await sendOtpEmail(user.email, code);
        return res.json({ twoFactorRequired: true, userId: user.id, email: user.email });
      }
      req.session.userId = user.id;
      req.userId = user.id;
      const token = await generateToken(user.id);
      return res.json({ ...formatUser(user), token });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/2fa/verify", authRateLimit, async (req: Request, res: Response) => {
    try {
      const { userId, code, rememberDevice } = req.body;
      if (!userId || !code) {
        return res.status(400).json({ message: "userId and code are required." });
      }
      const result = await storage.verifyLoginOtp(userId, code);
      if (!result.valid) {
        const msgMap = {
          expired: "Code expired. Please request a new one.",
          max_attempts: "Too many attempts. Please request a new code.",
          invalid: "Incorrect code. Please try again.",
        } as const;
        return res.status(400).json({
          message: msgMap[result.reason ?? "invalid"],
          reason: result.reason ?? "invalid",
        });
      }
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found." });
      req.session.userId = user.id;
      req.userId = user.id;
      const token = await generateToken(user.id);
      const response: Record<string, unknown> = { ...formatUser(user), token };
      if (rememberDevice === true) {
        const deviceToken = await createTrustedDevice(user.id);
        response.deviceToken = deviceToken;
      }
      return res.json(response);
    } catch (err) {
      console.error("2FA verify error:", err);
      return res.status(500).json({ message: "Verification failed." });
    }
  });

  app.delete("/api/auth/trusted-devices/me", requireAuth, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM trusted_devices WHERE user_id = $1`, [req.userId]);
      return res.json({ success: true });
    } catch (err) {
      console.error("Delete trusted devices error:", err);
      return res.status(500).json({ message: "Failed to remove trusted devices." });
    }
  });

  app.post("/api/auth/2fa/resend", authRateLimit, async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "userId is required." });
      const user = await storage.getUserById(userId);
      if (!user) return res.status(404).json({ message: "User not found." });
      if (!user.isTwoFactorEnabled) {
        return res.status(400).json({ message: "Two-factor authentication is not enabled." });
      }
      const code = await storage.createLoginOtp(user.id);
      await sendOtpEmail(user.email, code);
      return res.json({ success: true });
    } catch (err) {
      console.error("2FA resend error:", err);
      return res.status(500).json({ message: "Failed to resend code." });
    }
  });

  // 2FA is always enabled by default; no user toggle endpoint

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const user = await storage.getUserById(req.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const token = await generateToken(user.id);
      return res.json({ ...formatUser(user), token });
    } catch (err) {
      console.error("Get user error:", err);
      return res.status(500).json({ message: "Failed to get user" });
    }
  });

  app.put("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { email, newPassword } = req.body;
      if (!email || !newPassword) {
        return res.status(400).json({ message: "Email and new password required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const updated = await storage.updatePassword(email.toLowerCase(), newPassword);
      if (!updated) {
        return res.status(404).json({ message: "No account found with that email" });
      }
      return res.json({ message: "Password updated successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/auth/verify-reset-token/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token as string;
      if (!token) return res.json({ valid: false });
      const result = await storage.verifyResetToken(token);
      return res.json({ valid: result.valid });
    } catch (err) {
      console.error("Verify reset token error:", err);
      return res.json({ valid: false });
    }
  });

  app.get("/api/auth/security-question/:email", async (req: Request, res: Response) => {
    try {
      const emailParam = req.params.email;
      const email = Array.isArray(emailParam) ? emailParam[0] : emailParam;
      if (!email) return res.status(400).json({ message: "Email required" });
      const question = await storage.getSecurityQuestionByEmail(email.toLowerCase());
      if (!question) {
        return res.status(404).json({ message: "No account found with that email, or no security question set." });
      }
      return res.json({ question });
    } catch (err) {
      console.error("Get security question error:", err);
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/verify-security-answer", forgotPasswordRateLimit, async (req: Request, res: Response) => {
    try {
      const { email, answer } = req.body;
      if (!email || !answer) return res.status(400).json({ message: "Email and answer required" });
      const result = await storage.verifySecurityAnswer(email.toLowerCase(), answer);
      if (!result) {
        return res.status(400).json({ message: "Incorrect answer. Please try again." });
      }
      const { token, rateLimited } = await storage.createResetToken(result.userId);
      if (rateLimited) {
        return res.status(429).json({ message: "Please wait a moment before trying again." });
      }
      return res.json({ success: true, resetToken: token });
    } catch (err) {
      console.error("Verify security answer error:", err);
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.put("/api/auth/security-question", requireAuth, async (req: Request, res: Response) => {
    try {
      const { question, answer } = req.body;
      if (!question || !answer) return res.status(400).json({ message: "Question and answer required" });
      if (!(ALLOWED_SECURITY_QUESTIONS as readonly string[]).includes(question)) {
        return res.status(400).json({ message: "Invalid security question. Please choose from the provided list." });
      }
      if (answer.trim().length < 2) return res.status(400).json({ message: "Answer is too short" });
      await storage.setSecurityQuestion(req.userId!, question, answer);
      return res.json({ success: true });
    } catch (err) {
      console.error("Set security question error:", err);
      return res.status(500).json({ message: "Failed to save security question" });
    }
  });

  app.get("/api/auth/has-security-question", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.userId!);
      return res.json({ hasSecurityQuestion: !!(user?.securityQuestion) });
    } catch (err) {
      console.error("Has security question error:", err);
      return res.status(500).json({ message: "Failed to check security question" });
    }
  });

  app.get("/api/auth/my-security-question", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUserById(req.userId!);
      if (!user || !user.securityQuestion) {
        return res.json({ question: null });
      }
      return res.json({ question: user.securityQuestion });
    } catch (err) {
      console.error("My security question error:", err);
      return res.status(500).json({ message: "Failed to fetch security question" });
    }
  });

  app.post("/api/auth/forgot-password-otp", forgotPasswordOtpRateLimit, async (req: Request, res: Response) => {
    try {
      const { email, lang } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required." });
      const result = await storage.createPasswordResetOtp(email.toLowerCase().trim());
      if (result.notFound) {
        return res.status(200).json({ success: true });
      }
      if (result.rateLimited) {
        return res.status(429).json({
          message: `Please wait ${result.retryAfter} seconds before requesting another code.`,
          retryAfter: result.retryAfter,
        });
      }
      const emailLang = typeof lang === "string" && lang === "hi" ? "hi" : "en";
      await sendPasswordResetOtpEmail(email.toLowerCase().trim(), result.code, emailLang);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Forgot password OTP error:", err);
      return res.status(500).json({ message: "Failed to send code. Please try again." });
    }
  });

  app.post("/api/auth/verify-password-otp", forgotPasswordRateLimit, async (req: Request, res: Response) => {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) return res.status(400).json({ message: "Email and code are required." });
      const result = await storage.verifyPasswordResetOtp(email.toLowerCase().trim(), otp.trim());
      if (!result.valid) {
        const msgMap: Record<string, string> = {
          expired: "Code has expired. Please request a new one.",
          max_attempts: "Too many attempts. Please request a new code.",
          invalid: "Incorrect code. Please try again.",
          not_found: "No account found with that email.",
        };
        return res.status(400).json({
          message: msgMap[result.reason ?? "invalid"] ?? "Incorrect code. Please try again.",
          reason: result.reason ?? "invalid",
        });
      }
      return res.json({ success: true, resetToken: result.resetToken });
    } catch (err) {
      console.error("Verify password OTP error:", err);
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/confirm-reset-password", async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required." });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }
      const result = await storage.consumeResetToken(token.trim(), newPassword);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid or expired link. Please request a new one." });
      }
      return res.json({ message: "Password updated successfully." });
    } catch (err) {
      console.error("Confirm reset error:", err);
      return res.status(500).json({ message: "Failed to reset password." });
    }
  });

  app.put("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      const result = await storage.changePassword(req.userId!, currentPassword, newPassword);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      return res.json({ message: result.message });
    } catch (err) {
      console.error("Change password error:", err);
      return res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.put("/api/auth/onboarding", requireAuth, async (req: Request, res: Response) => {
    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
      const { identity, gender } = parsed.data;
      const user = await storage.completeOnboarding(req.userId!, {
        identity,
        gender,
        tonePreference: "Motivating",
        compass: "",
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json(formatUser(user));
    } catch (err) {
      console.error("Onboarding error:", err);
      return res.status(500).json({ message: "Onboarding failed" });
    }
  });

  app.put("/api/auth/profile", requireAuth, async (req: Request, res: Response) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0].message });
    }
    try {
      const result = await storage.updateProfile(req.userId!, parsed.data);
      if (result.error) {
        return res.status(409).json({ message: result.error });
      }
      const user = result.user;
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json(formatUser(user));
    } catch (err) {
      console.error("Update profile error:", err);
      return res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.put("/api/auth/phone", requireAuth, async (req: Request, res: Response) => {
    try {
      const { countryCode, phoneNumber, whatsappOptIn } = req.body;
      const result = await storage.updatePhone(req.userId!, {
        countryCode: phoneNumber ? (countryCode || null) : null,
        phoneNumber: phoneNumber || null,
        whatsappOptIn: phoneNumber ? !!whatsappOptIn : false,
      });
      if (result.error) return res.status(409).json({ message: result.error });
      const user = result.user;
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json(formatUser(user));
    } catch (err) {
      console.error("Update phone error:", err);
      return res.status(500).json({ message: "Failed to update phone" });
    }
  });

  // PUT /api/auth/push-token — store or clear the user's Expo push token
  app.put("/api/auth/push-token", requireAuth, async (req: Request, res: Response) => {
    const { token } = req.body;
    if (token !== null && typeof token !== "string") {
      return res.status(400).json({ message: "token must be a string or null" });
    }
    try {
      await pool.query(
        "UPDATE users SET push_token = $1 WHERE id = $2",
        [token ?? null, req.userId!]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error("Push token update error:", err);
      return res.status(500).json({ message: "Failed to update push token" });
    }
  });
}
