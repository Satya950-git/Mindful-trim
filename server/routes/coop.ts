import type { Express, Request, Response } from "express";
import { requireAuth } from "./middleware";
import { createNotification, deleteByChallenge } from "../inboxDb";
import { getUserLang, notifStrings, bothLangs2Args, bothLangsGroupNudge } from "../notificationI18n";
import {
  createCoopGroup,
  getCoopGroupsForUser,
  inviteToCoopGroup,
  respondToCoopInvite,
  leaveCoopGroup,
  addHabitToCoopGroup,
  deleteHabitFromCoopGroup,
  removeMemberFromCoopGroup,
} from "../services/coopService";
import { recordNudge } from "../services/nudgeService";
import { sendPushToUser } from "../services/pushService";
import { canViewCoop } from "../services/privacyService";
import { areFriends } from "../services/inviteService";
import { pool } from "../db";
import { GROUP_HABIT_LIMIT } from "../../shared/appConfig";

export function registerCoopRoutes(app: Express) {
  // POST /api/coop — create a COOP group
  app.post("/api/coop", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { name, habitNames, friendIds } = req.body;

    if (!name || !Array.isArray(habitNames) || habitNames.length === 0) {
      return res.status(400).json({ error: "name and at least one habitName required" });
    }
    if (!Array.isArray(friendIds)) {
      return res.status(400).json({ error: "friendIds must be an array" });
    }
    if (habitNames.length > GROUP_HABIT_LIMIT) {
      return res.status(400).json({ error: `Maximum ${GROUP_HABIT_LIMIT} habits per group` });
    }

    try {
      for (const fid of friendIds) {
        if (fid === userId) continue;
        const ok = await areFriends(userId, fid);
        if (!ok) return res.status(400).json({ error: `User ${fid} is not your friend` });
      }

      const group = await createCoopGroup(userId, name, habitNames, friendIds);

      // Send inbox + push notifications to every invited friend (fire-and-forget)
      if (friendIds.length > 0) {
        const [creatorRes] = await Promise.all([
          pool.query(
            `SELECT COALESCE(NULLIF(identity,''), email, 'Someone') AS name FROM users WHERE id = $1`,
            [userId]
          ),
        ]);
        const creatorName = creatorRes.rows[0]?.name ?? "Someone";
        const n = notifStrings.groupInvite;

        for (const friendId of friendIds) {
          if (friendId === userId) continue;
          try {
            const recipientLang = await getUserLang(friendId);
            const inviteBoth = bothLangs2Args('groupInvite', creatorName, name.trim());
            const inviteTitle = n.title[recipientLang];
            const inviteMsg = n.body[recipientLang](creatorName, name.trim());
            createNotification({
              userId: friendId,
              title: inviteBoth.titleEn,
              message: inviteBoth.msgEn,
              titleHi: inviteBoth.titleHi,
              messageHi: inviteBoth.msgHi,
              type: "GROUP_CHALLENGE",
              challengeType: "coop-invite",
              challengeId: group.id,
            }).catch(() => {});
            sendPushToUser(friendId, {
              title: inviteTitle,
              body: inviteMsg,
              data: { screen: "coop-group", groupId: group.id },
            });
          } catch {}
        }
      }

      return res.status(201).json(group);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "You already have a group with this name.") {
        return res.status(409).json({ error: msg });
      }
      console.error("[coop] create error:", err);
      return res.status(500).json({ error: "Failed to create COOP group" });
    }
  });

  // GET /api/coop — all COOP groups the caller is in
  app.get("/api/coop", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const groups = await getCoopGroupsForUser(userId);
      return res.json(groups);
    } catch (err) {
      console.error("[coop] list error:", err);
      return res.status(500).json({ error: "Failed to fetch COOP groups" });
    }
  });

  // DELETE /api/coop/:id — leave a COOP group
  app.delete("/api/coop/:id", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      const result = await leaveCoopGroup(id, userId);
      return res.json({ success: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to leave group";
      console.error("[coop] leave error:", err);
      return res.status(400).json({ error: msg });
    }
  });

  // POST /api/coop/:id/invite — invite a friend to an existing group
  app.post("/api/coop/:id/invite", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { friendId } = req.body;

    if (!friendId) return res.status(400).json({ error: "friendId required" });

    try {
      const ok = await areFriends(userId, friendId);
      if (!ok) return res.status(400).json({ error: "Can only invite accepted friends" });

      await inviteToCoopGroup(id, userId, friendId);

      // Create an inbox notification for the invited user
      const [groupRes, inviterRes, recipientLang] = await Promise.all([
        pool.query(`SELECT name FROM coop_groups WHERE id = $1`, [id]),
        pool.query(
          `SELECT COALESCE(NULLIF(identity,''), email, 'Someone') AS name FROM users WHERE id = $1`,
          [userId]
        ),
        getUserLang(friendId),
      ]);
      const groupName = groupRes.rows[0]?.name ?? "a group";
      const inviterName = inviterRes.rows[0]?.name ?? "Someone";

      const n = notifStrings.groupInvite;
      const inviteBoth2 = bothLangs2Args('groupInvite', inviterName, groupName);
      const inviteTitle = n.title[recipientLang];
      const inviteMsg = n.body[recipientLang](inviterName, groupName);

      createNotification({
        userId: friendId,
        title: inviteBoth2.titleEn,
        message: inviteBoth2.msgEn,
        titleHi: inviteBoth2.titleHi,
        messageHi: inviteBoth2.msgHi,
        type: "GROUP_CHALLENGE",
        challengeType: "coop-invite",
        challengeId: id,
      }).catch(() => {});

      sendPushToUser(friendId, {
        title: inviteTitle,
        body: inviteMsg,
        data: { screen: "coop-group", groupId: id },
      });

      return res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to invite";
      console.error("[coop] invite error:", err);
      return res.status(400).json({ error: msg });
    }
  });

  // POST /api/coop/:id/habits — add a new habit to an existing group
  app.post("/api/coop/:id/habits", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { habitName } = req.body;

    if (!habitName || typeof habitName !== "string") {
      return res.status(400).json({ error: "habitName required" });
    }

    try {
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM coop_group_habits WHERE group_id = $1`,
        [id]
      );
      if (countRows[0].cnt >= GROUP_HABIT_LIMIT) {
        return res.status(400).json({ error: `Maximum ${GROUP_HABIT_LIMIT} habits per group` });
      }

      const habit = await addHabitToCoopGroup(id, userId, habitName);
      return res.status(201).json(habit);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add habit";
      console.error("[coop] add habit error:", err);
      return res.status(400).json({ error: msg });
    }
  });

  // DELETE /api/coop/:groupId/habits/:habitId — owner removes a habit from a group
  app.delete("/api/coop/:groupId/habits/:habitId", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { groupId, habitId } = req.params;
    try {
      await deleteHabitFromCoopGroup(groupId, userId, habitId);
      return res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete habit";
      console.error("[coop] delete habit error:", err);
      return res.status(400).json({ error: msg });
    }
  });

  // DELETE /api/coop/:groupId/members/:memberId — owner removes a member from a group
  app.delete("/api/coop/:groupId/members/:memberId", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { groupId, memberId } = req.params;
    try {
      await removeMemberFromCoopGroup(groupId, userId, memberId);
      return res.json({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove member";
      console.error("[coop] remove member error:", err);
      return res.status(400).json({ error: msg });
    }
  });

  // POST /api/coop/:id/respond — accept or reject a group invite
  app.post("/api/coop/:id/respond", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { action } = req.body;

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be accept or reject" });
    }

    try {
      const result = await respondToCoopInvite(id, userId, action as "accept" | "reject");
      deleteByChallenge(id, 'coop-invite', userId).catch(() => {});
      return res.json({ success: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to respond";
      console.error("[coop] respond error:", err);
      return res.status(400).json({ error: msg });
    }
  });

  // POST /api/coop/:groupId/habits/:habitId/complete — mark a specific habit done today
  app.post("/api/coop/:groupId/habits/:habitId/complete", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { groupId, habitId } = req.params;
    const today = new Date().toISOString().split("T")[0];

    try {
      const allowed = await canViewCoop(userId, groupId);
      if (!allowed) return res.status(403).json({ error: "Not a member of this group" });

      const { rows: hRows } = await pool.query(
        `SELECT id FROM coop_group_habits WHERE id = $1 AND group_id = $2`,
        [habitId, groupId]
      );
      if (!hRows.length) return res.status(404).json({ error: "Habit not found in this group" });

      await pool.query(
        `INSERT INTO coop_habit_completions (group_id, habit_id, user_id, completed_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (habit_id, user_id, completed_date) DO NOTHING`,
        [groupId, habitId, userId, today]
      );
      return res.json({ success: true, doneToday: true });
    } catch (err) {
      console.error("[coop] habit complete error:", err);
      return res.status(500).json({ error: "Failed to mark habit complete" });
    }
  });

  // DELETE /api/coop/:groupId/habits/:habitId/complete — undo today's habit completion
  app.delete("/api/coop/:groupId/habits/:habitId/complete", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { groupId, habitId } = req.params;
    const today = new Date().toISOString().split("T")[0];

    try {
      const allowed = await canViewCoop(userId, groupId);
      if (!allowed) return res.status(403).json({ error: "Not a member of this group" });

      await pool.query(
        `DELETE FROM coop_habit_completions WHERE habit_id = $1 AND user_id = $2 AND completed_date = $3`,
        [habitId, userId, today]
      );
      return res.json({ success: true, doneToday: false });
    } catch (err) {
      console.error("[coop] habit undo error:", err);
      return res.status(500).json({ error: "Failed to undo habit completion" });
    }
  });

  // POST /api/coop/:id/nudge — nudge all pending members in a group (1 per day)
  app.post("/api/coop/:id/nudge", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      const allowed = await canViewCoop(userId, id);
      if (!allowed) return res.status(403).json({ error: "Not a member of this group" });

      // Rate limit: 1 group nudge per sender per day
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { rows: recentNudge } = await pool.query(
        `SELECT 1 FROM nudges
         WHERE sender_id = $1 AND context_type = 'coop' AND context_id = $2
           AND created_at >= $3
         LIMIT 1`,
        [userId, id, todayStart]
      );
      if (recentNudge.length > 0) {
        return res.status(429).json({ error: "You already nudged this group today. Try again tomorrow." });
      }

      const { rows: gRows } = await pool.query(
        `SELECT name FROM coop_groups WHERE id = $1`, [id]
      );
      if (!gRows.length) return res.status(404).json({ error: "Group not found" });

      const { rows: senderRows } = await pool.query(
        `SELECT COALESCE(NULLIF(identity,''), email, 'Someone') AS name FROM users WHERE id = $1`,
        [userId]
      );
      const senderName = senderRows[0]?.name ?? "Someone";
      const groupName = gRows[0].name;

      const today = new Date().toISOString().split("T")[0];

      // Find active members who haven't logged today
      const { rows: pendingMembers } = await pool.query(
        `SELECT m.user_id FROM coop_group_members m
         WHERE m.group_id = $1 AND m.status = 'active' AND m.user_id != $2
           AND NOT EXISTS (
             SELECT 1 FROM daily_logs dl WHERE dl.user_id = m.user_id AND dl.date = $3
           )`,
        [id, userId, today]
      );

      const nudgeBoth = bothLangsGroupNudge(senderName);

      for (const member of pendingMembers) {
        const recipientLang = await getUserLang(member.user_id);
        const nudgeMsg = notifStrings.groupNudge.body[recipientLang](senderName);
        await recordNudge(userId, member.user_id, "coop", id, nudgeMsg);
      }

      // Fire-and-forget push notifications + inbox items to all nudged members
      for (const member of pendingMembers) {
        const recipientLang = await getUserLang(member.user_id);
        const nudgeTitle = notifStrings.groupNudge.title[recipientLang];
        const nudgeMsg = notifStrings.groupNudge.body[recipientLang](senderName);
        sendPushToUser(member.user_id, {
          title: nudgeTitle,
          body: nudgeMsg,
          data: { screen: "coop-group", groupId: id },
        });
        createNotification({
          userId: member.user_id,
          title: nudgeBoth.titleEn,
          message: nudgeBoth.msgEn,
          titleHi: nudgeBoth.titleHi,
          messageHi: nudgeBoth.msgHi,
          type: "GROUP_CHALLENGE",
          challengeType: "coop",
          challengeId: id,
        }).catch(() => {});
      }

      return res.json({ success: true, nudgedCount: pendingMembers.length });
    } catch (err) {
      console.error("[coop] nudge error:", err);
      return res.status(500).json({ error: "Failed to send nudges" });
    }
  });

  // GET /api/coop/:id — group detail: member count + per-member habit progress
  app.get("/api/coop/:id", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const today = new Date().toISOString().split("T")[0];

    try {
      const allowed = await canViewCoop(userId, id);
      if (!allowed) return res.status(403).json({ error: "Not a member of this group" });

      const { rows: gRows } = await pool.query(
        `SELECT
           g.id, g.name, g.invite_token AS "inviteToken", g.created_at AS "createdAt",
           g.creator_id AS "creatorId",
           COALESCE(NULLIF(cu.identity,''), cu.email, 'Someone') AS "creatorName",
           (SELECT COUNT(*)::int FROM coop_group_members WHERE group_id = g.id AND status IN ('active', 'pending')) AS "memberCount",
           (SELECT COUNT(*)::int FROM coop_group_habits WHERE group_id = g.id) AS "habitCount"
         FROM coop_groups g
         JOIN users cu ON cu.id = g.creator_id
         WHERE g.id = $1`,
        [id]
      );
      if (!gRows.length) return res.status(404).json({ error: "Group not found" });

      const { rows: members } = await pool.query(
        `SELECT
           m.user_id AS "userId",
           m.status,
           m.created_at AS "joinedAt",
           COALESCE(NULLIF(u.identity,''), u.email, 'User') AS name,
           u.profile_photo AS "avatarUrl",
           CASE WHEN m.user_id = g.creator_id THEN 'owner' ELSE 'member' END AS role,
           COUNT(DISTINCT chc.habit_id)::int AS "completedToday",
           (SELECT COUNT(*)::int FROM coop_group_habits WHERE group_id = $1) AS "totalHabits"
         FROM coop_group_members m
         JOIN users u ON u.id = m.user_id
         JOIN coop_groups g ON g.id = m.group_id
         LEFT JOIN coop_habit_completions chc
           ON chc.group_id = $1 AND chc.user_id = m.user_id AND chc.completed_date = $2
         WHERE m.group_id = $1 AND m.status IN ('active', 'pending')
         GROUP BY m.user_id, m.status, m.created_at, u.identity, u.email, u.profile_photo, g.creator_id
         ORDER BY (m.status = 'pending')::int ASC, COUNT(DISTINCT chc.habit_id) DESC, m.created_at ASC`,
        [id, today]
      );

      return res.json({ ...gRows[0], members });
    } catch (err) {
      console.error("[coop] detail error:", err);
      return res.status(500).json({ error: "Failed to fetch group" });
    }
  });

  // GET /api/coop/:id/members — paginated + searchable members with progress
  app.get("/api/coop/:id/members", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const search = ((req.query.search as string) || "").trim();
    const PAGE_SIZE = 20;
    const offset = (page - 1) * PAGE_SIZE;
    const today = new Date().toISOString().split("T")[0];

    try {
      const allowed = await canViewCoop(userId, id);
      if (!allowed) return res.status(403).json({ error: "Not a member of this group" });

      const searchClause = search
        ? `AND COALESCE(NULLIF(u.identity,''), u.email, 'User') ILIKE $3`
        : "";
      const listParams: (string | number)[] = search ? [id, today, `%${search}%`] : [id, today];
      const countParams: string[] = search ? [id, `%${search}%`] : [id];
      const countSearchClause = search ? `AND COALESCE(NULLIF(u.identity,''), u.email, 'User') ILIKE $2` : "";

      const { rows: members } = await pool.query(
        `SELECT
           m.user_id AS "userId",
           m.status,
           m.created_at AS "joinedAt",
           COALESCE(NULLIF(u.identity,''), u.email, 'User') AS name,
           u.profile_photo AS "avatarUrl",
           CASE WHEN m.user_id = g.creator_id THEN 'owner' ELSE 'member' END AS role,
           COUNT(DISTINCT chc.habit_id)::int AS "completedToday",
           (SELECT COUNT(*)::int FROM coop_group_habits WHERE group_id = $1) AS "totalHabits"
         FROM coop_group_members m
         JOIN users u ON u.id = m.user_id
         JOIN coop_groups g ON g.id = m.group_id
         LEFT JOIN coop_habit_completions chc
           ON chc.group_id = $1 AND chc.user_id = m.user_id AND chc.completed_date = $2
         WHERE m.group_id = $1 AND m.status IN ('active', 'pending') ${searchClause}
         GROUP BY m.user_id, m.status, m.created_at, u.identity, u.email, u.profile_photo, g.creator_id
         ORDER BY (m.status = 'pending')::int ASC, COUNT(DISTINCT chc.habit_id) DESC, m.created_at ASC
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        listParams
      );

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM coop_group_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.group_id = $1 AND m.status IN ('active', 'pending') ${countSearchClause}`,
        countParams
      );

      // Members the caller has already nudged individually today in this group
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { rows: nudgedRows } = await pool.query(
        `SELECT DISTINCT recipient_id FROM nudges
         WHERE sender_id = $1 AND context_type = 'coop' AND context_id = $2 AND created_at >= $3`,
        [userId, id, todayStart]
      );
      const nudgedMemberIds: string[] = nudgedRows.map((r: { recipient_id: string }) => r.recipient_id);

      return res.json({
        members,
        total: countRows[0].total,
        page,
        pageSize: PAGE_SIZE,
        hasMore: offset + members.length < countRows[0].total,
        nudgedMemberIds,
      });
    } catch (err) {
      console.error("[coop] members error:", err);
      return res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // POST /api/coop/:id/nudge/:memberId — nudge a specific member in a group (1 per day)
  app.post("/api/coop/:id/nudge/:memberId", requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id, memberId } = req.params;

    try {
      const allowed = await canViewCoop(userId, id);
      if (!allowed) return res.status(403).json({ error: "Not a member of this group" });

      if (memberId === userId) {
        return res.status(400).json({ error: "Cannot nudge yourself" });
      }

      // Rate limit: 1 nudge to this member per sender per day
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { rows: recentNudge } = await pool.query(
        `SELECT 1 FROM nudges
         WHERE sender_id = $1 AND context_type = 'coop' AND context_id = $2
           AND recipient_id = $3 AND created_at >= $4
         LIMIT 1`,
        [userId, id, memberId, todayStart]
      );
      if (recentNudge.length > 0) {
        return res.status(429).json({ error: "You already nudged this member today." });
      }

      // Verify target is an active member of this group
      const { rows: memberRows } = await pool.query(
        `SELECT user_id FROM coop_group_members
         WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
        [id, memberId]
      );
      if (!memberRows.length) {
        return res.status(404).json({ error: "Member not found in this group" });
      }

      const { rows: gRows } = await pool.query(
        `SELECT name FROM coop_groups WHERE id = $1`, [id]
      );
      const groupName = gRows[0]?.name ?? "the group";

      const { rows: senderRows } = await pool.query(
        `SELECT COALESCE(NULLIF(identity,''), email, 'Someone') AS name FROM users WHERE id = $1`,
        [userId]
      );
      const senderName = senderRows[0]?.name ?? "Someone";
      const recipientLang = await getUserLang(memberId);
      const nudgeTitle = notifStrings.groupNudge.title[recipientLang];
      const nudgeMsg = notifStrings.groupNudge.body[recipientLang](senderName);
      const nudgeBothMember = bothLangsGroupNudge(senderName);

      await recordNudge(userId, memberId, "coop", id, nudgeMsg);

      // Fire-and-forget push notification + inbox item to the nudged member
      sendPushToUser(memberId, {
        title: nudgeTitle,
        body: nudgeMsg,
        data: { screen: "coop-group", groupId: id },
      });
      createNotification({
        userId: memberId,
        title: nudgeBothMember.titleEn,
        message: nudgeBothMember.msgEn,
        titleHi: nudgeBothMember.titleHi,
        messageHi: nudgeBothMember.msgHi,
        type: "GROUP_CHALLENGE",
        challengeType: "coop",
        challengeId: id,
      }).catch(() => {});

      return res.json({ success: true });
    } catch (err) {
      console.error("[coop] member nudge error:", err);
      return res.status(500).json({ error: "Failed to send nudge" });
    }
  });
}
