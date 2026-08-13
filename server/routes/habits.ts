import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireAuth } from "./middleware";
import { HABITS } from "../../data/habitsData";
import { TIMEBLOCK_HABIT_LIMIT, PILLAR_HABIT_LIMIT } from "../../shared/appConfig";

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function seedHabitsIfNeeded() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT COUNT(*)::int as cnt FROM habit_library');
    if (rows[0].cnt > 0) return;
    for (const h of HABITS) {
      await client.query(
        `INSERT INTO habit_library (habit_id, time_block, pillar, habit_name, description)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (habit_id) DO NOTHING`,
        [h.habitId, h.timeBlock, h.pillar, h.habitName, h.description]
      );
    }
    console.log(`[habits] Seeded ${HABITS.length} habits into habit_library`);
  } catch (err) {
    console.error('[habits] Seed error:', err);
  } finally {
    client.release();
  }
}

function clampFuel(v: unknown): number | null {
  if (typeof v !== 'number' || !isFinite(v)) return null;
  return Math.min(10, Math.max(1, Math.round(v)));
}

export async function registerHabitRoutes(app: Express) {
  await seedHabitsIfNeeded();

  // GET /api/habits — full catalogue with per-user isEnabled + completedToday
  app.get('/api/habits', async (req: Request, res: Response) => {
    const userId = req.userId;
    try {
      const { rows: catalogue } = await pool.query(
        `SELECT habit_id as "habitId", time_block as "timeBlock", pillar,
                habit_name as "habitName", description
         FROM habit_library ORDER BY time_block, pillar, habit_id`
      );

      if (!userId) {
        return res.json(catalogue.map((h: any) => ({ ...h, isEnabled: false, completedToday: false, isCoOp: false, partnerId: null, partnerName: null })));
      }

      const today = getTodayStr();
      const { rows: prefs } = await pool.query(
        `SELECT uh.habit_id as "habitId", uh.is_enabled as "isEnabled",
                uh.is_co_op as "isCoOp", uh.partner_id as "partnerId",
                COALESCE(u.identity, u.email, 'Friend') as "partnerName"
         FROM user_habits uh
         LEFT JOIN users u ON u.id = uh.partner_id
         WHERE uh.user_id = $1`,
        [userId]
      );
      const { rows: logs } = await pool.query(
        `SELECT habit_id as "habitId" FROM habit_logs WHERE user_id = $1 AND date = $2`,
        [userId, today]
      );
      const prefMap: Record<string, any> = {};
      for (const p of prefs) prefMap[(p as any).habitId] = p;
      const completedSet = new Set(logs.map((l: any) => l.habitId));

      return res.json(catalogue.map((h: any) => ({
        ...h,
        isEnabled: prefMap[h.habitId]?.isEnabled ?? false,
        completedToday: completedSet.has(h.habitId),
        isCoOp: prefMap[h.habitId]?.isCoOp ?? false,
        partnerId: prefMap[h.habitId]?.partnerId ?? null,
        partnerName: prefMap[h.habitId]?.partnerName ?? null,
      })));
    } catch (err) {
      console.error('[habits] GET /api/habits error:', err);
      return res.status(500).json({ message: 'Failed to fetch habits' });
    }
  });

  // GET /api/habits/my — user's habits + co-op fields + journey fields + today completions
  app.get('/api/habits/my', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const today = getTodayStr();
    try {
      const { rows: prefs } = await pool.query(
        `SELECT uh.habit_id as "habitId", uh.is_enabled as "isEnabled",
                uh.is_co_op as "isCoOp", uh.partner_id as "partnerId",
                uh.journey_start_date as "journeyStartDate",
                uh.journey_target_days as "journeyTargetDays",
                uh.habit_status as "habitStatus",
                uh.notify_enabled as "notifyEnabled",
                COALESCE(uh.pillar_visibility, '{}') as "pillarVisibility",
                COALESCE(u.identity, u.email, 'Friend') as "partnerName"
         FROM user_habits uh
         LEFT JOIN users u ON u.id = uh.partner_id
         WHERE uh.user_id = $1`,
        [userId]
      );
      const prefMap: Record<string, any> = {};
      for (const p of prefs) prefMap[(p as any).habitId] = p;

      const { rows: logs } = await pool.query(
        `SELECT habit_id as "habitId" FROM habit_logs WHERE user_id = $1 AND date = $2`,
        [userId, today]
      );
      const completedSet = new Set(logs.map((l: any) => l.habitId));

      // Count completions since each habit's journey start date
      const journeyHabitIds = prefs
        .filter((p: any) => p.journeyStartDate)
        .map((p: any) => p.habitId);

      const journeyCountMap: Record<string, number> = {};
      if (journeyHabitIds.length > 0) {
        const { rows: journeyCounts } = await pool.query(
          `SELECT hl.habit_id as "habitId", COUNT(*)::int as cnt
           FROM habit_logs hl
           JOIN user_habits uh ON uh.user_id = hl.user_id AND uh.habit_id = hl.habit_id
           WHERE hl.user_id = $1
             AND hl.habit_id = ANY($2::text[])
             AND uh.journey_start_date IS NOT NULL
             AND hl.date >= uh.journey_start_date
           GROUP BY hl.habit_id`,
          [userId, journeyHabitIds]
        );
        for (const row of journeyCounts) {
          journeyCountMap[(row as any).habitId] = (row as any).cnt;
        }
      }

      const result = HABITS.map(h => ({
        ...h,
        isEnabled: prefMap[h.habitId]?.isEnabled ?? false,
        completedToday: completedSet.has(h.habitId),
        isCoOp: prefMap[h.habitId]?.isCoOp ?? false,
        partnerId: prefMap[h.habitId]?.partnerId ?? null,
        partnerName: prefMap[h.habitId]?.partnerName ?? null,
        journeyStartDate: prefMap[h.habitId]?.journeyStartDate ?? null,
        journeyTargetDays: prefMap[h.habitId]?.journeyTargetDays ?? null,
        habitStatus: prefMap[h.habitId]?.habitStatus ?? 'active',
        notifyEnabled: prefMap[h.habitId]?.notifyEnabled ?? true,
        journeyCompletionCount: prefMap[h.habitId]?.journeyStartDate
          ? (journeyCountMap[h.habitId] ?? 0)
          : null,
        pillarVisibility: prefMap[h.habitId]?.pillarVisibility ?? {},
      }));

      return res.json(result);
    } catch (err) {
      console.error('[habits] GET /api/habits/my error:', err);
      return res.status(500).json({ message: 'Failed to fetch user habits' });
    }
  });

  // PUT /api/habits/:habitId/toggle — add-if-missing then flip is_enabled
  app.put('/api/habits/:habitId/toggle', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    try {
      const { rows: existing } = await pool.query(
        `SELECT is_enabled FROM user_habits WHERE user_id = $1 AND habit_id = $2`,
        [userId, habitId]
      );
      let isEnabled: boolean;
      if (existing.length === 0) {
        isEnabled = true;
      } else {
        isEnabled = !(existing[0] as any).is_enabled;
      }
      // Enforce per-time-block and per-pillar limits when enabling
      if (isEnabled) {
        const { rows: habitRow } = await pool.query(
          `SELECT time_block as "timeBlock", pillar FROM habit_library WHERE habit_id = $1`,
          [habitId]
        );
        const timeBlock = habitRow[0]?.timeBlock;
        const pillar = habitRow[0]?.pillar;
        if (timeBlock) {
          const { rows: countRows } = await pool.query(
            `SELECT COUNT(*)::int as cnt
             FROM user_habits uh
             JOIN habit_library hl ON hl.habit_id = uh.habit_id
             WHERE uh.user_id = $1 AND hl.time_block = $2 AND uh.is_enabled = true
               AND uh.habit_id != $3`,
            [userId, timeBlock, habitId]
          );
          if ((countRows[0] as any).cnt >= TIMEBLOCK_HABIT_LIMIT) {
            return res.json({
              success: false,
              message: `You can only enable ${TIMEBLOCK_HABIT_LIMIT} habits per time block.`,
              timeBlock,
              limit: TIMEBLOCK_HABIT_LIMIT,
            });
          }
          if (pillar) {
            const { rows: pillarRows } = await pool.query(
              `SELECT COUNT(*)::int as cnt
               FROM user_habits uh
               JOIN habit_library hl ON hl.habit_id = uh.habit_id
               WHERE uh.user_id = $1 AND hl.time_block = $2 AND hl.pillar = $3 AND uh.is_enabled = true
                 AND uh.habit_id != $4`,
              [userId, timeBlock, pillar, habitId]
            );
            if ((pillarRows[0] as any).cnt >= PILLAR_HABIT_LIMIT) {
              return res.json({
                success: false,
                message: `You can only add ${PILLAR_HABIT_LIMIT} ${pillar} habits per time block.`,
                timeBlock,
                pillar,
                limit: PILLAR_HABIT_LIMIT,
              });
            }
          }
        }
        await pool.query(
          `INSERT INTO user_habits (user_id, habit_id, is_enabled) VALUES ($1, $2, true)
           ON CONFLICT (user_id, habit_id) DO UPDATE SET is_enabled = true`,
          [userId, habitId]
        );
      } else {
        await pool.query(
          `UPDATE user_habits SET is_enabled = $3 WHERE user_id = $1 AND habit_id = $2`,
          [userId, habitId, isEnabled]
        );
      }
      return res.json({ success: true, habitId, isEnabled });
    } catch (err) {
      console.error('[habits] toggle error:', err);
      return res.status(500).json({ message: 'Failed to toggle habit' });
    }
  });

  // PUT /api/habits/:habitId/coop — set co-op mode and partner
  app.put('/api/habits/:habitId/coop', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    const { isCoOp, partnerId } = req.body;

    if (typeof isCoOp !== 'boolean') {
      return res.status(400).json({ message: 'isCoOp must be a boolean' });
    }

    if (isCoOp && partnerId) {
      // Validate partnerId is an accepted friend
      const { rows: friendship } = await pool.query(
        `SELECT id FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
        [userId, partnerId]
      );
      if (friendship.length === 0) {
        return res.status(400).json({ message: 'Partner must be an accepted friend' });
      }
    }

    try {
      const safePartnerId = isCoOp && partnerId ? partnerId : null;
      await pool.query(
        `UPDATE user_habits SET is_co_op = $3, partner_id = $4
         WHERE user_id = $1 AND habit_id = $2`,
        [userId, habitId, isCoOp, safePartnerId]
      );

      const { rows } = await pool.query(
        `SELECT COALESCE(u.identity, u.email, 'Friend') as "partnerName"
         FROM users u WHERE u.id = $1`,
        [safePartnerId ?? '']
      );
      const partnerName = rows[0]?.partnerName ?? null;

      return res.json({ success: true, habitId, isCoOp, partnerId: safePartnerId, partnerName });
    } catch (err) {
      console.error('[habits] coop error:', err);
      return res.status(500).json({ message: 'Failed to update co-op mode' });
    }
  });

  // GET /api/habits/:habitId/partner-status — partner completion status for a date
  app.get('/api/habits/:habitId/partner-status', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    const date = (req.query.date as string) || getTodayStr();

    try {
      // Get the habit's co-op config (must be participant)
      const { rows: habit } = await pool.query(
        `SELECT uh.is_co_op as "isCoOp", uh.partner_id as "partnerId",
                uh.user_id as "habitUserId",
                COALESCE(u.identity, u.email, 'Friend') as "partnerName"
         FROM user_habits uh
         LEFT JOIN users u ON u.id = uh.partner_id
         WHERE uh.habit_id = $1
           AND (uh.user_id = $2 OR uh.partner_id = $2)
         LIMIT 1`,
        [habitId, userId]
      );

      if (!habit.length || !habit[0].isCoOp || !habit[0].partnerId) {
        return res.json({ partnerCompleted: false, partnerName: null, isCoOp: false });
      }

      // The partner is the "other" user
      const partnerId = habit[0].partnerId === userId ? habit[0].habitUserId : habit[0].partnerId;

      const { rows: partnerLog } = await pool.query(
        `SELECT id FROM habit_logs WHERE user_id = $1 AND habit_id = $2 AND date = $3`,
        [partnerId, habitId, date]
      );

      return res.json({
        isCoOp: true,
        partnerCompleted: partnerLog.length > 0,
        partnerName: habit[0].partnerName,
      });
    } catch (err) {
      console.error('[habits] partner-status error:', err);
      return res.status(500).json({ message: 'Failed to fetch partner status' });
    }
  });

  // POST /api/habits/:habitId/add — explicitly add (enable) a habit
  app.post('/api/habits/:habitId/add', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    try {
      // Enforce per-time-block and per-pillar limits
      const { rows: habitRow } = await pool.query(
        `SELECT time_block as "timeBlock", pillar FROM habit_library WHERE habit_id = $1`,
        [habitId]
      );
      const timeBlock = habitRow[0]?.timeBlock;
      const pillar = habitRow[0]?.pillar;
      if (timeBlock) {
        const { rows: countRows } = await pool.query(
          `SELECT COUNT(*)::int as cnt
           FROM user_habits uh
           JOIN habit_library hl ON hl.habit_id = uh.habit_id
           WHERE uh.user_id = $1 AND hl.time_block = $2 AND uh.is_enabled = true
             AND uh.habit_id != $3`,
          [userId, timeBlock, habitId]
        );
        if ((countRows[0] as any).cnt >= TIMEBLOCK_HABIT_LIMIT) {
          return res.json({
            success: false,
            message: `You can only enable ${TIMEBLOCK_HABIT_LIMIT} habits per time block.`,
            timeBlock,
            limit: TIMEBLOCK_HABIT_LIMIT,
          });
        }
        if (pillar) {
          const { rows: pillarRows } = await pool.query(
            `SELECT COUNT(*)::int as cnt
             FROM user_habits uh
             JOIN habit_library hl ON hl.habit_id = uh.habit_id
             WHERE uh.user_id = $1 AND hl.time_block = $2 AND hl.pillar = $3 AND uh.is_enabled = true
               AND uh.habit_id != $4`,
            [userId, timeBlock, pillar, habitId]
          );
          if ((pillarRows[0] as any).cnt >= PILLAR_HABIT_LIMIT) {
            return res.json({
              success: false,
              message: `You can only add ${PILLAR_HABIT_LIMIT} ${pillar} habits per time block.`,
              timeBlock,
              pillar,
              limit: PILLAR_HABIT_LIMIT,
            });
          }
        }
      }
      await pool.query(
        `INSERT INTO user_habits (user_id, habit_id, is_enabled)
         VALUES ($1, $2, true)
         ON CONFLICT (user_id, habit_id) DO UPDATE SET is_enabled = true`,
        [userId, habitId]
      );
      return res.json({ success: true, habitId, isEnabled: true });
    } catch (err) {
      console.error('[habits] add error:', err);
      return res.status(500).json({ message: 'Failed to add habit' });
    }
  });

  // DELETE /api/habits/:habitId/add — remove habit from user's list
  app.delete('/api/habits/:habitId/add', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    try {
      await pool.query(
        `DELETE FROM user_habits WHERE user_id = $1 AND habit_id = $2`,
        [userId, habitId]
      );
      return res.json({ success: true, habitId });
    } catch (err) {
      console.error('[habits] remove error:', err);
      return res.status(500).json({ message: 'Failed to remove habit' });
    }
  });

  // PATCH /api/habits/:habitId/configure — set journey target, mode, partner
  app.patch('/api/habits/:habitId/configure', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    const { journeyTargetDays, isCoOp, partnerId } = req.body;

    // Validate journey target
    if (journeyTargetDays !== undefined) {
      const days = Number(journeyTargetDays);
      if (!Number.isInteger(days) || days < 18) {
        return res.status(400).json({ message: 'journeyTargetDays must be an integer ≥ 18' });
      }
    }

    // Validate partner if Co-Op
    if (isCoOp && partnerId) {
      const { rows: friendship } = await pool.query(
        `SELECT id FROM friendships
         WHERE status = 'accepted'
           AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))`,
        [userId, partnerId]
      );
      if (friendship.length === 0) {
        return res.status(400).json({ message: 'Partner must be an accepted friend' });
      }
    }

    try {
      const today = getTodayStr();
      const safePartnerId = isCoOp && partnerId ? partnerId : null;

      // Check if habit is already enabled — if not, enforce limits before enabling
      const { rows: existing } = await pool.query(
        `SELECT is_enabled FROM user_habits WHERE user_id = $1 AND habit_id = $2`,
        [userId, habitId]
      );
      const alreadyEnabled = existing.length > 0 && (existing[0] as any).is_enabled === true;
      if (!alreadyEnabled) {
        const { rows: habitRow } = await pool.query(
          `SELECT time_block as "timeBlock", pillar FROM habit_library WHERE habit_id = $1`,
          [habitId]
        );
        const timeBlock = habitRow[0]?.timeBlock;
        const pillar = habitRow[0]?.pillar;
        if (timeBlock) {
          const { rows: countRows } = await pool.query(
            `SELECT COUNT(*)::int as cnt
             FROM user_habits uh
             JOIN habit_library hl ON hl.habit_id = uh.habit_id
             WHERE uh.user_id = $1 AND hl.time_block = $2 AND uh.is_enabled = true
               AND uh.habit_id != $3`,
            [userId, timeBlock, habitId]
          );
          if ((countRows[0] as any).cnt >= TIMEBLOCK_HABIT_LIMIT) {
            return res.status(400).json({
              message: `You can only enable ${TIMEBLOCK_HABIT_LIMIT} habits per time block.`,
              timeBlock,
              limit: TIMEBLOCK_HABIT_LIMIT,
            });
          }
          if (pillar) {
            const { rows: pillarRows } = await pool.query(
              `SELECT COUNT(*)::int as cnt
               FROM user_habits uh
               JOIN habit_library hl ON hl.habit_id = uh.habit_id
               WHERE uh.user_id = $1 AND hl.time_block = $2 AND hl.pillar = $3 AND uh.is_enabled = true
                 AND uh.habit_id != $4`,
              [userId, timeBlock, pillar, habitId]
            );
            if ((pillarRows[0] as any).cnt >= PILLAR_HABIT_LIMIT) {
              return res.status(400).json({
                message: `You can only add ${PILLAR_HABIT_LIMIT} ${pillar} habits per time block.`,
                timeBlock,
                pillar,
                limit: PILLAR_HABIT_LIMIT,
              });
            }
          }
        }
      }

      // Upsert user_habits row with journey + co-op info, set start date to today if not already set
      await pool.query(
        `INSERT INTO user_habits (user_id, habit_id, is_enabled, is_co_op, partner_id, journey_start_date, journey_target_days, habit_status)
         VALUES ($1, $2, true, $3, $4, $5, $6, 'active')
         ON CONFLICT (user_id, habit_id) DO UPDATE SET
           is_enabled = true,
           is_co_op = EXCLUDED.is_co_op,
           partner_id = EXCLUDED.partner_id,
           journey_start_date = CASE
             WHEN user_habits.journey_start_date IS NULL THEN EXCLUDED.journey_start_date
             ELSE user_habits.journey_start_date
           END,
           journey_target_days = EXCLUDED.journey_target_days,
           habit_status = CASE
             WHEN user_habits.habit_status = 'maintained' AND EXCLUDED.journey_target_days IS NOT NULL THEN 'active'
             ELSE user_habits.habit_status
           END`,
        [userId, habitId, isCoOp ?? false, safePartnerId, today, journeyTargetDays ?? null]
      );

      const { rows: updated } = await pool.query(
        `SELECT uh.is_co_op as "isCoOp", uh.partner_id as "partnerId",
                uh.journey_start_date as "journeyStartDate",
                uh.journey_target_days as "journeyTargetDays",
                uh.habit_status as "habitStatus",
                COALESCE(u.identity, u.email, 'Friend') as "partnerName"
         FROM user_habits uh
         LEFT JOIN users u ON u.id = uh.partner_id
         WHERE uh.user_id = $1 AND uh.habit_id = $2`,
        [userId, habitId]
      );

      return res.json({ success: true, habitId, ...(updated[0] ?? {}) });
    } catch (err) {
      console.error('[habits] configure error:', err);
      return res.status(500).json({ message: 'Failed to configure habit' });
    }
  });

  // POST /api/habits/:habitId/complete — mark complete for today; returns dualComplete + habitMastered
  app.post('/api/habits/:habitId/complete', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    const today = getTodayStr();
    try {
      await pool.query(
        `INSERT INTO habit_logs (user_id, habit_id, date)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, habit_id, date) DO NOTHING`,
        [userId, habitId, today]
      );

      // Check for co-op dual completion
      const { rows: coopRows } = await pool.query(
        `SELECT uh.is_co_op as "isCoOp", uh.partner_id as "partnerId",
                uh.journey_start_date as "journeyStartDate",
                uh.journey_target_days as "journeyTargetDays",
                uh.habit_status as "habitStatus",
                COALESCE(u.identity, u.email, 'Friend') as "partnerName"
         FROM user_habits uh
         LEFT JOIN users u ON u.id = uh.partner_id
         WHERE uh.user_id = $1 AND uh.habit_id = $2`,
        [userId, habitId]
      );

      let dualComplete = false;
      let partnerName = '';
      let habitMastered = false;

      if (coopRows.length > 0) {
        const row = coopRows[0];
        if (row.isCoOp && row.partnerId) {
          const { rows: partnerLog } = await pool.query(
            `SELECT id FROM habit_logs WHERE user_id = $1 AND habit_id = $2 AND date = $3`,
            [row.partnerId, habitId, today]
          );
          dualComplete = partnerLog.length > 0;
          partnerName = row.partnerName ?? '';
        }

        // Check journey mastery: elapsed calendar days >= target
        if (row.habitStatus !== 'maintained' && row.journeyStartDate && row.journeyTargetDays) {
          const start = new Date(row.journeyStartDate);
          const now   = new Date();
          // Add target_days to start and check if we've passed that date
          const masterDate = new Date(start);
          masterDate.setDate(masterDate.getDate() + Number(row.journeyTargetDays));
          if (now >= masterDate) {
            habitMastered = true;
            await pool.query(
              `UPDATE user_habits
               SET habit_status = 'maintained', notify_enabled = FALSE
               WHERE user_id = $1 AND habit_id = $2`,
              [userId, habitId]
            );
          }
        }
      }

      return res.json({ success: true, habitId, date: today, dualComplete, partnerName, habitMastered });
    } catch (err) {
      console.error('[habits] complete error:', err);
      return res.status(500).json({ message: 'Failed to log habit completion' });
    }
  });

  // DELETE /api/habits/:habitId/complete — unmark complete for today
  app.delete('/api/habits/:habitId/complete', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    const today = getTodayStr();
    try {
      await pool.query(
        `DELETE FROM habit_logs WHERE user_id = $1 AND habit_id = $2 AND date = $3`,
        [userId, habitId, today]
      );
      return res.json({ success: true, habitId, date: today });
    } catch (err) {
      console.error('[habits] uncomplete error:', err);
      return res.status(500).json({ message: 'Failed to remove habit log' });
    }
  });

  // POST /api/habits/:habitId/nudge — send a nudge to co-op partner (rate-limited to 1/hour)
  app.post('/api/habits/:habitId/nudge', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    try {
      // Verify caller is in co-op for this habit and find partner
      const { rows: habit } = await pool.query(
        `SELECT uh.is_co_op as "isCoOp", uh.partner_id as "partnerId",
                COALESCE(u.identity, u.email, 'Friend') as "partnerName"
         FROM user_habits uh
         LEFT JOIN users u ON u.id = uh.partner_id
         WHERE uh.user_id = $1 AND uh.habit_id = $2`,
        [userId, habitId]
      );
      if (!habit.length || !habit[0].isCoOp || !habit[0].partnerId) {
        return res.status(400).json({ message: 'Not in co-op mode for this habit' });
      }
      const partnerId = habit[0].partnerId;

      // Rate limit: 1 nudge per (sender, habit) per hour
      const { rows: recent } = await pool.query(
        `SELECT id FROM habit_nudges
         WHERE sender_id = $1 AND habit_id = $2
           AND sent_at > NOW() - INTERVAL '1 hour'`,
        [userId, habitId]
      );
      if (recent.length > 0) {
        return res.status(429).json({ message: 'You already sent a nudge for this habit in the last hour' });
      }

      await pool.query(
        `INSERT INTO habit_nudges (sender_id, receiver_id, habit_id) VALUES ($1, $2, $3)`,
        [userId, partnerId, habitId]
      );

      return res.json({ success: true });
    } catch (err) {
      console.error('[habits] nudge error:', err);
      return res.status(500).json({ message: 'Failed to send nudge' });
    }
  });

  // GET /api/habits/nudges — get nudges received in the last 24h (for snackbar display)
  app.get('/api/habits/nudges', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const { rows } = await pool.query(
        `SELECT hn.habit_id as "habitId", hn.sent_at as "sentAt",
                COALESCE(u.identity, u.email, 'Friend') as "senderName"
         FROM habit_nudges hn
         JOIN users u ON u.id = hn.sender_id
         WHERE hn.receiver_id = $1
           AND hn.sent_at > NOW() - INTERVAL '24 hours'
         ORDER BY hn.sent_at DESC`,
        [userId]
      );
      return res.json(rows);
    } catch (err) {
      console.error('[habits] GET /api/habits/nudges error:', err);
      return res.status(500).json({ message: 'Failed to fetch nudges' });
    }
  });

  // PUT /api/habits/:habitId/pillar-visibility — set pillar visibility for co-op
  app.put('/api/habits/:habitId/pillar-visibility', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { habitId } = req.params;
    const { visibility } = req.body;
    if (!visibility || typeof visibility !== 'object') {
      return res.status(400).json({ message: 'visibility must be an object' });
    }
    try {
      await pool.query(
        `UPDATE user_habits SET pillar_visibility = $3
         WHERE user_id = $1 AND habit_id = $2`,
        [userId, habitId, JSON.stringify(visibility)]
      );
      return res.json({ success: true, habitId, visibility });
    } catch (err) {
      console.error('[habits] pillar-visibility error:', err);
      return res.status(500).json({ message: 'Failed to update pillar visibility' });
    }
  });

  // GET /api/daily-fuel — today's log + recent 3 days
  app.get('/api/daily-fuel', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const today = getTodayStr();
    try {
      const { rows } = await pool.query(
        `SELECT date, hydration, sleep, energy
         FROM daily_fuel_logs
         WHERE user_id = $1
         ORDER BY date DESC LIMIT 4`,
        [userId]
      );
      const todayLog = rows.find((r: any) => r.date === today) || null;
      const recent = rows.filter((r: any) => r.date !== today).slice(0, 3);
      return res.json({ today: todayLog, recent });
    } catch (err) {
      console.error('[habits] GET /api/daily-fuel error:', err);
      return res.status(500).json({ message: 'Failed to fetch daily fuel' });
    }
  });

  // POST /api/daily-fuel — upsert today's fuel (1–10 scale), return smart nudge
  app.post('/api/daily-fuel', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const today = getTodayStr();

    const rawH = clampFuel(req.body.hydration);
    const rawS = clampFuel(req.body.sleep);
    const rawE = clampFuel(req.body.energy);

    if (rawH === null || rawS === null || rawE === null) {
      return res.status(400).json({ message: 'hydration, sleep, and energy must be numbers between 1 and 10' });
    }

    try {
      await pool.query(
        `INSERT INTO daily_fuel_logs (user_id, date, hydration, sleep, energy)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, date)
         DO UPDATE SET hydration = EXCLUDED.hydration, sleep = EXCLUDED.sleep,
                       energy = EXCLUDED.energy, logged_at = NOW()`,
        [userId, today, rawH, rawS, rawE]
      );

      const { rows: recent } = await pool.query(
        `SELECT hydration, sleep, energy FROM daily_fuel_logs
         WHERE user_id = $1 AND date < $2
         ORDER BY date DESC LIMIT 3`,
        [userId, today]
      );

      let nudge: string | null = null;
      if (recent.length >= 3) {
        const avg = (key: string) =>
          recent.reduce((sum: number, r: any) => sum + Number(r[key]), 0) / recent.length;
        const THRESHOLD = 0.8;
        if (rawH <= avg('hydration') * THRESHOLD) {
          nudge = 'Your hydration is below your recent average — drink an extra glass of water today.';
        } else if (rawS <= avg('sleep') * THRESHOLD) {
          nudge = 'You\'re sleeping less than usual — consider an earlier bedtime tonight.';
        } else if (rawE <= avg('energy') * THRESHOLD) {
          nudge = 'Your energy is lower than your recent baseline — take a 10-minute rest or get some fresh air.';
        }
      }

      return res.json({ success: true, nudge });
    } catch (err) {
      console.error('[habits] POST /api/daily-fuel error:', err);
      return res.status(500).json({ message: 'Failed to save daily fuel' });
    }
  });

  // GET /api/habits/streak — today's completion vs enabled count
  app.get('/api/habits/streak', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const today = getTodayStr();
    try {
      const { rows: enabled } = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM user_habits WHERE user_id = $1 AND is_enabled = true`,
        [userId]
      );
      const { rows: done } = await pool.query(
        `SELECT COUNT(DISTINCT habit_id)::int as cnt FROM habit_logs WHERE user_id = $1 AND date = $2`,
        [userId, today]
      );
      return res.json({
        enabledCount: (enabled[0] as any)?.cnt ?? 0,
        completedToday: (done[0] as any)?.cnt ?? 0,
      });
    } catch (err) {
      return res.status(500).json({ message: 'Failed to fetch streak' });
    }
  });
}
