/**
 * inboxDb.ts
 *
 * User notification inbox — stores nudges, challenge reminders, and other
 * per-user notifications so they persist after system push notifications
 * are dismissed.
 */

import { pool } from "./db";

export type InboxNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "GROUP_CHALLENGE" | "ONE_TO_ONE" | "GENERAL";
  challengeType: string | null;
  challengeId: string | null;
  isRead: boolean;
  createdAt: string;
  clickedAt: string | null;
};

export async function ensureInboxTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      message     TEXT NOT NULL,
      title_hi    TEXT,
      message_hi  TEXT,
      type        VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
      challenge_type VARCHAR(20),
      challenge_id   VARCHAR,
      is_read     BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      clicked_at  TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS user_notifications_user_idx         ON user_notifications (user_id);
    CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx ON user_notifications (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS user_notifications_user_read_idx    ON user_notifications (user_id, is_read);
  `);

  // Add bilingual columns to existing tables (idempotent)
  await pool.query(`
    ALTER TABLE user_notifications
      ADD COLUMN IF NOT EXISTS title_hi   TEXT,
      ADD COLUMN IF NOT EXISTS message_hi TEXT;
  `);
}

export async function createNotification(params: {
  userId: string;
  title: string;
  message: string;
  titleHi?: string | null;
  messageHi?: string | null;
  type?: "GROUP_CHALLENGE" | "ONE_TO_ONE" | "GENERAL";
  challengeType?: string | null;
  challengeId?: string | null;
}): Promise<InboxNotification> {
  const { rows } = await pool.query(
    `INSERT INTO user_notifications
       (user_id, title, message, title_hi, message_hi, type, challenge_type, challenge_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, user_id as "userId", title, message, type,
               challenge_type as "challengeType", challenge_id as "challengeId",
               is_read as "isRead",
               created_at as "createdAt", clicked_at as "clickedAt"`,
    [
      params.userId,
      params.title,
      params.message,
      params.titleHi ?? null,
      params.messageHi ?? null,
      params.type ?? "GENERAL",
      params.challengeType ?? null,
      params.challengeId ?? null,
    ]
  );
  return rows[0];
}

export async function getInbox(
  userId: string,
  limit: number,
  offset: number,
  lang: "en" | "hi" = "en"
): Promise<InboxNotification[]> {
  const { rows } = await pool.query(
    `SELECT
       n.id,
       n.user_id as "userId",
       CASE
         WHEN $4 = 'hi' AND n.title_hi IS NOT NULL THEN n.title_hi
         ELSE n.title
       END AS title,
       CASE
         WHEN $4 = 'hi' AND n.message_hi IS NOT NULL THEN n.message_hi
         ELSE n.message
       END AS message,
       n.type,
       n.challenge_type as "challengeType",
       n.challenge_id as "challengeId",
       n.is_read as "isRead",
       n.created_at as "createdAt",
       n.clicked_at as "clickedAt"
     FROM user_notifications n
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset, lang]
  );
  return rows;
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int as count FROM user_notifications WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return rows[0]?.count ?? 0;
}

export async function markOneRead(
  id: string,
  userId: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE user_notifications
     SET is_read = TRUE, clicked_at = NOW()
     WHERE id = $1 AND user_id = $2 AND is_read = FALSE`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function markAllRead(userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE user_notifications SET is_read = TRUE, clicked_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return rowCount ?? 0;
}

export async function deleteOne(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_notifications WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteByChallenge(
  challengeId: string,
  challengeType: string,
  userId: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_notifications
     WHERE challenge_id = $1 AND challenge_type = $2 AND user_id = $3`,
    [challengeId, challengeType, userId]
  );
  return rowCount ?? 0;
}
