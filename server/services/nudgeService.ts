import { pool } from "../db";

export async function recordNudge(
  senderId: string,
  recipientId: string,
  contextType: "1on1" | "coop",
  contextId: string,
  message: string
): Promise<{ id: string }> {
  const { rows } = await pool.query(
    `INSERT INTO nudges (sender_id, recipient_id, context_type, context_id, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [senderId, recipientId, contextType, contextId, message]
  );
  return rows[0];
}

export async function dismissNudge(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM nudges WHERE id = $1 AND recipient_id = $2`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function getNudgesForUser(userId: string) {
  const { rows } = await pool.query(
    `SELECT
       n.id,
       n.context_type AS "contextType",
       n.context_id   AS "contextId",
       n.message,
       n.created_at   AS "createdAt",
       COALESCE(NULLIF(u.identity,''), u.email, 'Someone') AS "senderName"
     FROM nudges n
     JOIN users u ON u.id = n.sender_id
     WHERE n.recipient_id = $1
     ORDER BY n.created_at DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
}
