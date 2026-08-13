import { pool } from "../db";

/** Returns true if the two users are accepted friends. */
export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT id FROM friendships
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND addressee_id = $2)
         OR (requester_id = $2 AND addressee_id = $1))`,
    [userA, userB]
  );
  return rows.length > 0;
}

/** Generates a random 32-char hex token (safe in PostgreSQL via md5). */
export async function generateToken(): Promise<string> {
  const { rows } = await pool.query(`SELECT md5(gen_random_uuid()::text) AS token`);
  return rows[0].token as string;
}
