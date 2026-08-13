import type { Express, Request, Response } from "express";
import path from "node:path";
import fs from "node:fs";
import * as storage from "../storage";
import * as appConfigDb from "../appConfigDb";
import { requireAuth } from "./middleware";


const templatesDir = path.resolve(process.cwd(), "server", "templates");

export function registerMiscRoutes(app: Express) {
  app.get("/api/config", async (_req: Request, res: Response) => {
    try {
      const appStoreUrl = await appConfigDb.getAppStoreUrl();
      return res.json({ appStoreUrl });
    } catch (err) {
      console.error("[config] GET failed:", err);
      return res.status(500).json({ message: "Failed to read config" });
    }
  });

  app.patch("/api/config", requireAuth, async (req: Request, res: Response) => {
    const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean);
    if (adminEmails.length > 0) {
      const user = await storage.getUserById(req.userId!);
      if (!user || !adminEmails.includes(user.email)) {
        return res.status(403).json({ message: "Admin access required" });
      }
    }
    try {
      const { appStoreUrl } = req.body as { appStoreUrl?: string };
      const updates: appConfigDb.AppConfig = {};
      if (appStoreUrl !== undefined) updates.appStoreUrl = appStoreUrl || null;
      const updated = await appConfigDb.updateAppConfig(updates);
      return res.json({ success: true, config: { appStoreUrl: updated.appStoreUrl ?? null } });
    } catch (err) {
      console.error("[config] PATCH failed:", err);
      return res.status(500).json({ message: "Failed to update config" });
    }
  });

  app.post("/api/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const { rating, category, message } = req.body;
      if (!rating || !category || !message) {
        return res.status(400).json({ message: "rating, category, and message are required" });
      }
      if (typeof rating !== "number" || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "rating must be between 1 and 5" });
      }
      if (!message.trim()) {
        return res.status(400).json({ message: "message cannot be empty" });
      }
      const entry = await storage.saveFeedback(req.userId!, {
        rating,
        category,
        message: message.trim(),
      });
      console.info("[Feedback] userId=%s rating=%s category=%s", req.userId, rating, category);
      return res.json(entry);
    } catch (err) {
      console.error("Feedback error:", err);
      return res.status(500).json({ message: "Failed to save feedback" });
    }
  });

  app.get("/api/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const entries = await storage.getFeedback(req.userId!);
      return res.json(entries);
    } catch (err) {
      console.error("Get feedback error:", err);
      return res.status(500).json({ message: "Failed to get feedback" });
    }
  });

  app.delete("/api/account", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      await storage.deleteAccount(userId);
      req.session.destroy(() => {});
      console.info(`[Account] Deleted account for userId=${userId}`);
      return res.json({ message: "Account deleted" });
    } catch (err) {
      console.error("Delete account error:", err);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  app.get("/privacy", (_req: Request, res: Response) => {
    try {
      const html = fs.readFileSync(path.join(templatesDir, "privacy.html"), "utf-8"); // nosemgrep
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err) {
      console.error("Privacy page error:", err);
      return res.status(500).send("Privacy Policy unavailable");
    }
  });

  app.get("/terms", (_req: Request, res: Response) => {
    try {
      const html = fs.readFileSync(path.join(templatesDir, "terms.html"), "utf-8"); // nosemgrep
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err) {
      console.error("Terms page error:", err);
      return res.status(500).send("Terms of Service unavailable");
    }
  });

  app.get("/invite", (req: Request, res: Response) => {
    try {
      const html = fs.readFileSync(path.join(templatesDir, "invite.html"), "utf-8"); // nosemgrep
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err) {
      console.error("Invite page error:", err);
      return res.status(500).send("Invite page unavailable");
    }
  });

  // POST /api/invite/link — create a short invite link for the logged-in user
  app.post("/api/invite/link", requireAuth, async (req: Request, res: Response) => {
    try {
      const code = await storage.createInviteLink(req.userId!);
      return res.json({ url: `/i/${code}`, code });
    } catch (err) {
      console.error("[invite] create link error:", err);
      return res.status(500).json({ message: "Failed to create invite link" });
    }
  });

  // GET /i/:code — resolve short invite link → redirect to invite landing page
  app.get("/i/:code", async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const result = await storage.resolveInviteCode(code);
      if (!result) {
        return res.status(404).send("Invite link not found or expired.");
      }
      const target = `/invite?inviterId=${encodeURIComponent(result.inviterUserId)}&name=${encodeURIComponent(result.inviterName)}`;
      return res.redirect(302, target);
    } catch (err) {
      console.error("[invite] resolve code error:", err);
      return res.status(500).send("Could not resolve invite link.");
    }
  });
}
