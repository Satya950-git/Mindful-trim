import type { Express, Request, Response } from "express";
import * as notificationDb from "../notificationDb";
import * as inboxDb from "../inboxDb";
import { requireAuth } from "./middleware";

export function registerNotificationRoutes(app: Express) {
  // ── Push-notification schedule (existing) ────────────────────────────────

  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const lang = req.query.lang === "hi" ? "hi" : "en";
      const active = await notificationDb.getActiveNotifications();
      // Return rows with message_text set to the preferred language
      const localized = active.map((row) => ({
        ...row,
        message_text:
          lang === "hi" && row.message_text_hi
            ? row.message_text_hi
            : row.message_text,
      }));
      return res.json(localized);
    } catch (err) {
      console.error("[notifications] GET failed:", err);
      return res.status(500).json({ message: "Failed to read notifications" });
    }
  });

  app.get("/api/notifications/all", requireAuth, async (_req: Request, res: Response) => {
    try {
      return res.json(await notificationDb.getAllNotifications());
    } catch (err) {
      console.error("[notifications] GET all failed:", err);
      return res.status(500).json({ message: "Failed to read notifications" });
    }
  });

  app.patch("/api/notifications/:id/enable", requireAuth, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const ok = await notificationDb.enableNotification(id);
    if (!ok) return res.status(404).json({ message: "Notification not found" });
    const all = await notificationDb.getAllNotifications();
    const row = all.find((r) => r.id === id);
    return res.json({ success: true, notification: row });
  });

  app.patch("/api/notifications/:id/disable", requireAuth, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const ok = await notificationDb.disableNotification(id);
    if (!ok) return res.status(404).json({ message: "Notification not found" });
    const all = await notificationDb.getAllNotifications();
    const row = all.find((r) => r.id === id);
    return res.json({ success: true, notification: row });
  });

  app.patch("/api/notifications/:id", requireAuth, async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
    const { time_slot, message_text, is_active } = req.body as {
      time_slot?: string;
      message_text?: string;
      is_active?: boolean;
    };
    const updates: Parameters<typeof notificationDb.updateNotification>[1] = {};
    if (time_slot !== undefined) updates.time_slot = time_slot;
    if (message_text !== undefined) updates.message_text = message_text;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    const ok = await notificationDb.updateNotification(id, updates);
    if (!ok) return res.status(404).json({ message: "Notification not found" });
    const all = await notificationDb.getAllNotifications();
    const row = all.find((r) => r.id === id);
    return res.json({ success: true, notification: row });
  });

  // ── Notification Inbox ───────────────────────────────────────────────────

  // GET /api/inbox — paginated list of the user's inbox notifications
  app.get("/api/inbox", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 50);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const lang = req.query.lang === "hi" ? "hi" : "en";
    try {
      const items = await inboxDb.getInbox(userId, limit, offset, lang);
      return res.json({ items, limit, offset });
    } catch (err) {
      console.error("[inbox] GET failed:", err);
      return res.status(500).json({ message: "Failed to fetch inbox" });
    }
  });

  // GET /api/inbox/unread-count
  app.get("/api/inbox/unread-count", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const count = await inboxDb.getUnreadCount(userId);
      return res.json({ count });
    } catch (err) {
      console.error("[inbox] unread-count failed:", err);
      return res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  // PATCH /api/inbox/:id/read — mark a single notification read
  app.patch("/api/inbox/:id/read", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      await inboxDb.markOneRead(id, userId);
      const count = await inboxDb.getUnreadCount(userId);
      return res.json({ success: true, unreadCount: count });
    } catch (err) {
      console.error("[inbox] mark-read failed:", err);
      return res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  // DELETE /api/inbox/:id — delete a notification (used when user taps and navigates away)
  app.delete("/api/inbox/:id", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      await inboxDb.deleteOne(id, userId);
      const count = await inboxDb.getUnreadCount(userId);
      return res.json({ success: true, unreadCount: count });
    } catch (err) {
      console.error("[inbox] delete failed:", err);
      return res.status(500).json({ message: "Failed to delete notification" });
    }
  });

  // PATCH /api/inbox/read-all — mark all notifications read
  app.patch("/api/inbox/read-all", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const updated = await inboxDb.markAllRead(userId);
      return res.json({ success: true, updated });
    } catch (err) {
      console.error("[inbox] read-all failed:", err);
      return res.status(500).json({ message: "Failed to mark all read" });
    }
  });

  // POST /api/inbox — internal: create a notification (can be called from other routes)
  app.post("/api/inbox", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { title, message, type, challengeType, challengeId } = req.body as {
      title: string;
      message: string;
      type?: "GROUP_CHALLENGE" | "ONE_TO_ONE" | "GENERAL";
      challengeType?: string;
      challengeId?: string;
    };
    if (!title || !message) return res.status(400).json({ message: "title and message required" });
    try {
      const item = await inboxDb.createNotification({ userId, title, message, type, challengeType, challengeId });
      return res.json(item);
    } catch (err) {
      console.error("[inbox] POST failed:", err);
      return res.status(500).json({ message: "Failed to create notification" });
    }
  });
}
