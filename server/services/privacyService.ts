import { pool } from "../db";

export async function canView1on1(userId: string, challengeId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT id FROM one_on_one_challenges
     WHERE id = $1 AND (challenger_id = $2 OR challengee_id = $2)`,
    [challengeId, userId]
  );
  return rows.length > 0;
}

export async function canViewCoop(userId: string, groupId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT id FROM coop_group_members
     WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
    [groupId, userId]
  );
  return rows.length > 0;
}
