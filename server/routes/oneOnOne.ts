import type { Express, Request, Response } from "express";
import { requireAuth } from "./middleware";
import { createNotification, deleteByChallenge } from "../inboxDb";
import { getUserLang, notifStrings, bothLangs2Args, bothLangsGroupNudge, getHabitNameHi } from "../notificationI18n";
import {
  createChallenge,
  getChallengesForUser,
  respondToChallenge,
  leaveChallenge,
  completeChallengeForToday,
  uncompleteChallengeForToday,
} from "../services/challengeService";
import { recordNudge, getNudgesForUser, dismissNudge } from "../services/nudgeService";
import { sendPushToUser } from "../services/pushService";
import { canView1on1 } from "../services/privacyService";
import { areFriends } from "../services/inviteService";
import { pool } from "../db";

export function registerOneOnOneRoutes(app: Express) {
  // POST /api/1on1 — send a 1-on-1 challenge invite
  app.post("/api/1on1", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { challengeeId, habitName } = req.body;

    if (!challengeeId || !habitName) {
      return res.status(400).json({ error: "challengeeId and habitName required" });
    }
    if (challengeeId === userId) {
      return res.status(400).json({ error: "Cannot challenge yourself" });
    }

    try {
      const friends = await areFriends(userId, challengeeId);
      if (!friends) {
        return res.status(400).json({ error: "Can only challenge accepted friends" });
      }

      const challenge = await createChallenge(userId, challengeeId, habitName);

      // Notify the challengee
      const [nameRows, recipientLang] = await Promise.all([
        pool.query(
          `SELECT COALESCE(NULLIF(identity,''), email, 'Someone') AS name FROM users WHERE id = $1`,
          [userId]
        ),
        getUserLang(challengeeId),
      ]);
      const challengerName = nameRows.rows[0]?.name ?? 'Someone';
      const habitNameHi = getHabitNameHi(habitName);
      const both = bothLangs2Args('oneOnOneInvite', challengerName, habitName, habitNameHi);
      const inviteTitle = notifStrings.oneOnOneInvite.title[recipientLang];
      const inviteMsg = notifStrings.oneOnOneInvite.body[recipientLang](
        challengerName,
        recipientLang === 'hi' ? habitNameHi : habitName,
      );

      createNotification({
        userId: challengeeId,
        title: both.titleEn,
        message: both.msgEn,
        titleHi: both.titleHi,
        messageHi: both.msgHi,
        type: 'ONE_TO_ONE',
        challengeType: '1on1-invite',
        challengeId: challenge.id,
      }).catch(() => {});

      sendPushToUser(challengeeId, {
        title: inviteTitle,
        body: inviteMsg,
        data: { screen: '1on1-challenge', challengeId: challenge.id },
      });

      return res.status(201).json(challenge);
    } catch (err) {
      console.error("[1on1] create error:", err);
      return res.status(500).json({ error: "Failed to create challenge" });
    }
  });

  // GET /api/1on1 — list active/pending 1-on-1 challenges for the caller
  app.get("/api/1on1", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const challenges = await getChallengesForUser(userId);
      return res.json(challenges);
    } catch (err) {
      console.error("[1on1] list error:", err);
      return res.status(500).json({ error: "Failed to fetch challenges" });
    }
  });

  // POST /api/1on1/:id/respond — accept or reject an invite
  app.post("/api/1on1/:id/respond", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { action } = req.body;

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be accept or reject" });
    }

    try {
      const allowed = await canView1on1(userId, id);
      if (!allowed) return res.status(403).json({ error: "Not a participant" });

      const result = await respondToChallenge(id, userId, action as "accept" | "reject");
      deleteByChallenge(id, '1on1-invite', userId).catch(() => {});
      return res.json({ success: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to respond";
      console.error("[1on1] respond error:", err);
      return res.status(400).json({ error: msg });
    }
  });

  // POST /api/1on1/:id/nudge — send a nudge to the other participant
  app.post("/api/1on1/:id/nudge", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      const allowed = await canView1on1(userId, id);
      if (!allowed) return res.status(403).json({ error: "Not a participant" });

      // Enforce one nudge per sender per challenge per calendar day
      const { rows: cooldownRows } = await pool.query(
        `SELECT 1 FROM nudges
         WHERE sender_id = $1 AND context_type = '1on1' AND context_id = $2
           AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')`,
        [userId, id]
      );
      if (cooldownRows.length > 0) {
        return res.status(429).json({ error: "Already nudged today" });
      }

      const { rows } = await pool.query(
        `SELECT challenger_id, challengee_id, habit_name FROM one_on_one_challenges WHERE id = $1`,
        [id]
      );
      if (!rows.length) return res.status(404).json({ error: "Challenge not found" });

      const { challenger_id, challengee_id, habit_name } = rows[0];

      // Only the challenge creator (challenger) is allowed to nudge
      if (challenger_id !== userId) {
        return res.status(403).json({ error: "Only the challenge creator can send a nudge" });
      }

      const recipientId = challengee_id;

      const { rows: senderRows } = await pool.query(
        `SELECT COALESCE(NULLIF(identity,''), email, 'Your partner') AS name FROM users WHERE id = $1`,
        [userId]
      );
      const senderName = senderRows[0]?.name ?? "Your partner";
      const recipientLang = await getUserLang(recipientId);
      const nudgeHabitNameHi = getHabitNameHi(habit_name);
      const nudgeBoth = bothLangs2Args('oneOnOneNudge', senderName, habit_name, nudgeHabitNameHi);
      const nudgeTitle = notifStrings.oneOnOneNudge.title[recipientLang];
      const nudgeMsg = notifStrings.oneOnOneNudge.body[recipientLang](
        senderName,
        recipientLang === 'hi' ? nudgeHabitNameHi : habit_name,
      );

      await recordNudge(userId, recipientId, "1on1", id, nudgeMsg);

      // Fire-and-forget push notification to the recipient
      sendPushToUser(recipientId, {
        title: nudgeTitle,
        body: nudgeMsg,
        data: { screen: "1on1-challenge", challengeId: id },
      });
      createNotification({
        userId: recipientId,
        title: nudgeBoth.titleEn,
        message: nudgeBoth.msgEn,
        titleHi: nudgeBoth.titleHi,
        messageHi: nudgeBoth.msgHi,
        type: "ONE_TO_ONE",
        challengeType: "1on1",
        challengeId: id,
      }).catch(() => {});

      return res.json({ success: true });
    } catch (err) {
      console.error("[1on1] nudge error:", err);
      return res.status(500).json({ error: "Failed to send nudge" });
    }
  });

  // POST /api/1on1/:id/complete — mark done for today
  app.post("/api/1on1/:id/complete", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      const allowed = await canView1on1(userId, id);
      if (!allowed) return res.status(403).json({ error: "Not a participant" });
      await completeChallengeForToday(id, userId);
      return res.json({ success: true });
    } catch (err) {
      console.error("[1on1] complete error:", err);
      return res.status(500).json({ error: "Failed to mark challenge done" });
    }
  });

  // DELETE /api/1on1/:id/complete — unmark done for today
  app.delete("/api/1on1/:id/complete", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      const allowed = await canView1on1(userId, id);
      if (!allowed) return res.status(403).json({ error: "Not a participant" });
      await uncompleteChallengeForToday(id, userId);
      return res.json({ success: true });
    } catch (err) {
      console.error("[1on1] uncomplete error:", err);
      return res.status(500).json({ error: "Failed to unmark challenge" });
    }
  });

  // DELETE /api/1on1/:id — leave or cancel a 1-on-1 challenge
  app.delete("/api/1on1/:id", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      const result = await leaveChallenge(id, userId);
      return res.json({ success: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to leave challenge";
      console.error("[1on1] leave error:", err);
      return res.status(400).json({ error: msg });
    }
  });

  // GET /api/nudges — nudge inbox for the current user
  app.get("/api/nudges", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const nudges = await getNudgesForUser(userId);
      return res.json(nudges);
    } catch (err) {
      console.error("[nudges] list error:", err);
      return res.status(500).json({ error: "Failed to fetch nudges" });
    }
  });

  // DELETE /api/nudges/:id — dismiss a nudge permanently
  app.delete("/api/nudges/:id", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      await dismissNudge(id, userId);
      return res.json({ success: true });
    } catch (err) {
      console.error("[nudges] dismiss error:", err);
      return res.status(500).json({ error: "Failed to dismiss nudge" });
    }
  });
}
