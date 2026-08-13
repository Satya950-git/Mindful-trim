import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireAuth } from "./middleware";

export function registerChallengeRoutes(app: Express) {
  // POST /api/challenges — create a new group challenge
  app.post('/api/challenges', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { name, pillar, durationDays } = req.body;

    if (!name || !pillar || !durationDays) {
      return res.status(400).json({ error: 'name, pillar, durationDays required' });
    }
    const validPillars = ['Mental', 'Physical', 'Social', 'Spiritual'];
    if (!validPillars.includes(pillar)) {
      return res.status(400).json({ error: 'Invalid pillar' });
    }
    if (![7, 14, 30].includes(Number(durationDays))) {
      return res.status(400).json({ error: 'Duration must be 7, 14, or 30 days' });
    }

    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `INSERT INTO group_challenges (creator_id, name, pillar, duration_days)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, pillar, duration_days as "durationDays", created_at as "createdAt"`,
        [userId, name.trim().slice(0, 60), pillar, Number(durationDays)]
      );
      const chal = rows[0];

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + Number(durationDays));

      await client.query(
        `INSERT INTO challenge_participants (challenge_id, user_id, joined_at, personal_end_date, status)
         VALUES ($1, $2, NOW(), $3, 'active')`,
        [chal.id, userId, endDate.toISOString().split('T')[0]]
      );

      return res.status(201).json(chal);
    } catch (err) {
      console.error('[challenges] create error:', err);
      return res.status(500).json({ error: 'Failed to create challenge' });
    } finally {
      client.release();
    }
  });

  // GET /api/challenges — challenges the user is in (active, invited, completed)
  app.get('/api/challenges', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const { rows } = await pool.query(`
        SELECT
          gc.id, gc.name, gc.pillar, gc.duration_days AS "durationDays",
          gc.created_at AS "createdAt", gc.creator_id AS "creatorId",
          cp.status AS "myStatus", cp.joined_at AS "joinedAt",
          cp.personal_end_date AS "personalEndDate",
          COALESCE(NULLIF(u.identity,''), u.email, 'Unknown') AS "creatorName",
          (
            SELECT COUNT(*)::int FROM challenge_participants cp2
            WHERE cp2.challenge_id = gc.id AND cp2.status IN ('active','completed')
          ) AS "memberCount"
        FROM challenge_participants cp
        JOIN group_challenges gc ON gc.id = cp.challenge_id
        JOIN users u ON u.id = gc.creator_id
        WHERE cp.user_id = $1 AND cp.status IN ('active','completed','invited')
        ORDER BY cp.joined_at DESC NULLS LAST, gc.created_at DESC
      `, [userId]);
      return res.json(rows);
    } catch (err) {
      console.error('[challenges] list error:', err);
      return res.status(500).json({ error: 'Failed to fetch challenges' });
    }
  });

  // GET /api/challenges/:id — challenge detail with all members
  app.get('/api/challenges/:id', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      const { rows: chal } = await pool.query(`
        SELECT gc.id, gc.name, gc.pillar, gc.duration_days AS "durationDays",
               gc.created_at AS "createdAt", gc.creator_id AS "creatorId",
               COALESCE(NULLIF(u.identity,''), u.email, 'Unknown') AS "creatorName"
        FROM group_challenges gc
        JOIN users u ON u.id = gc.creator_id
        WHERE gc.id = $1
      `, [id]);
      if (!chal.length) return res.status(404).json({ error: 'Challenge not found' });

      const { rows: myPart } = await pool.query(
        `SELECT status FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2`,
        [id, userId]
      );
      if (!myPart.length) return res.status(403).json({ error: 'Not a member of this challenge' });

      const pillar: string = chal[0].pillar;

      const { rows: members } = await pool.query(`
        SELECT
          cp.id, cp.user_id AS "userId", cp.status,
          cp.joined_at AS "joinedAt",
          cp.personal_end_date AS "personalEndDate",
          COALESCE(NULLIF(u.identity,''), u.email, 'Unknown') AS name,
          (
            SELECT COUNT(DISTINCT dl.date)::int
            FROM daily_logs dl
            WHERE dl.user_id = cp.user_id
              AND dl.pillar = $2
              AND dl.date >= TO_CHAR(cp.joined_at::date, 'YYYY-MM-DD')
              AND dl.date <= TO_CHAR(LEAST(cp.personal_end_date::date, CURRENT_DATE), 'YYYY-MM-DD')
          ) AS "completionCount"
        FROM challenge_participants cp
        JOIN users u ON u.id = cp.user_id
        WHERE cp.challenge_id = $1 AND cp.status != 'voided'
        ORDER BY cp.joined_at ASC NULLS LAST
      `, [id, pillar]);

      return res.json({ ...chal[0], members, myStatus: myPart[0].status });
    } catch (err) {
      console.error('[challenges] detail error:', err);
      return res.status(500).json({ error: 'Failed to fetch challenge' });
    }
  });

  // POST /api/challenges/:id/invite — invite an accepted friend
  app.post('/api/challenges/:id/invite', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { toUserId } = req.body;

    if (!toUserId) return res.status(400).json({ error: 'toUserId required' });

    try {
      const { rows: myPart } = await pool.query(
        `SELECT status FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2`,
        [id, userId]
      );
      if (!myPart.length || myPart[0].status !== 'active') {
        return res.status(403).json({ error: 'Must be an active member to invite' });
      }

      const { rows: friendship } = await pool.query(
        `SELECT id FROM friendships WHERE status = 'accepted'
         AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
        [userId, toUserId]
      );
      if (!friendship.length) return res.status(400).json({ error: 'Can only invite accepted friends' });

      const { rows: existing } = await pool.query(
        `SELECT status FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2`,
        [id, toUserId]
      );
      if (existing.length > 0 && existing[0].status !== 'voided') {
        return res.json({ success: true, alreadyInvited: true });
      }

      if (existing.length > 0 && existing[0].status === 'voided') {
        return res.status(400).json({ error: 'User has left this challenge' });
      }

      await pool.query(
        `INSERT INTO challenge_participants (challenge_id, user_id, status)
         VALUES ($1, $2, 'invited')`,
        [id, toUserId]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error('[challenges] invite error:', err);
      return res.status(500).json({ error: 'Failed to invite' });
    }
  });

  // POST /api/challenges/:id/respond — accept or decline invite
  app.post('/api/challenges/:id/respond', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { action } = req.body;

    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept or decline' });
    }

    try {
      const { rows: part } = await pool.query(`
        SELECT cp.id, gc.duration_days FROM challenge_participants cp
        JOIN group_challenges gc ON gc.id = cp.challenge_id
        WHERE cp.challenge_id = $1 AND cp.user_id = $2 AND cp.status = 'invited'
      `, [id, userId]);
      if (!part.length) return res.status(404).json({ error: 'No pending invite found' });

      if (action === 'decline') {
        await pool.query(`DELETE FROM challenge_participants WHERE id = $1`, [part[0].id]);
        return res.json({ success: true, status: 'declined' });
      }

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + Number(part[0].duration_days));

      await pool.query(
        `UPDATE challenge_participants
         SET status = 'active', joined_at = NOW(), personal_end_date = $2
         WHERE id = $1`,
        [part[0].id, endDate.toISOString().split('T')[0]]
      );
      return res.json({ success: true, status: 'active' });
    } catch (err) {
      console.error('[challenges] respond error:', err);
      return res.status(500).json({ error: 'Failed to respond to invite' });
    }
  });

  // PATCH /api/challenges/:id/leave — void the caller's participant record
  app.patch('/api/challenges/:id/leave', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      const { rows } = await pool.query(
        `SELECT id FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2 AND status = 'active'`,
        [id, userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not an active participant' });

      await pool.query(
        `UPDATE challenge_participants SET status = 'voided' WHERE id = $1`,
        [rows[0].id]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error('[challenges] leave error:', err);
      return res.status(500).json({ error: 'Failed to leave challenge' });
    }
  });
}
