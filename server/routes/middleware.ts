import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { SignJWT, jwtVerify } from "jose";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "mindful-trim-jwt-secret";
  return new TextEncoder().encode(secret);
}

export async function generateToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15d")
    .sign(getJwtSecret());
}

export async function jwtMiddleware(req: Request, _res: Response, next: Function) {
  if (req.session?.userId) {
    req.userId = req.session.userId;
    return next();
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const { payload } = await jwtVerify(token, getJwtSecret());
      if (typeof payload.userId === "string") {
        req.userId = payload.userId;
      }
    } catch {
      // invalid token — req.userId stays undefined
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later." },
  skip: () => process.env.DISABLE_RATE_LIMIT === "true",
});

export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests, please try again later." },
  skip: () => process.env.DISABLE_RATE_LIMIT === "true",
});

export const forgotPasswordOtpRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many reset code requests for this email, please try again later." },
  skip: () => process.env.DISABLE_RATE_LIMIT === "true",
  keyGenerator: (req) => {
    const email = (req.body?.email ?? "").toString().toLowerCase().trim();
    return email || req.ip || "unknown";
  },
});
