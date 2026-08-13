import { pool } from "../db";

const MAX_1ON1_PER_PAIR = 5;

export async function createChallenge(
  challengerId: string,
  challengeeId: string,
  habitName: string
) {
  const trimmedHabit = habitName.trim().slice(0, 100);

  // Prevent duplicate habit for the same pair with pending/active status
  const { rows: dupRows } = await pool.query(
    `SELECT 1 FROM one_on_one_challenges
     WHERE challenger_id = $1 AND challengee_id = $2
       AND LOWER(habit_name) = LOWER($3)
       AND status IN ('pending', 'active')
     LIMIT 1`,
    [challengerId, challengeeId, trimmedHabit]
  );
  if (dupRows.length > 0) {
    throw new Error("You already have a pending or active challenge with this habit for this friend.");
  }

  // Enforce max 5 active/pending challenges between the same pair
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM one_on_one_challenges
     WHERE ((challenger_id = $1 AND challengee_id = $2) OR (challenger_id = $2 AND challengee_id = $1))
       AND status IN ('pending', 'active')`,
    [challengerId, challengeeId]
  );
  if (countRows[0].cnt >= MAX_1ON1_PER_PAIR) {
    throw new Error(`You can have at most ${MAX_1ON1_PER_PAIR} active or pending challenges with the same friend.`);
  }

  const { rows } = await pool.query(
    `INSERT INTO one_on_one_challenges (challenger_id, challengee_id, habit_name, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, challenger_id AS "challengerId", challengee_id AS "challengeeId",
               habit_name AS "habitName", status, created_at AS "createdAt"`,
    [challengerId, challengeeId, trimmedHabit]
  );
  return rows[0];
}

export async function getChallengesForUser(userId: string) {
  const today = new Date().toISOString().split("T")[0];
  const { rows } = await pool.query(
    `SELECT
       c.id,
       c.habit_name        AS "habitName",
       c.status,
       c.created_at        AS "createdAt",
       c.challenger_id     AS "challengerId",
       c.challengee_id     AS "challengeeId",
       COALESCE(NULLIF(uc.identity,''), uc.email, 'User') AS "challengerName",
       COALESCE(NULLIF(ue.identity,''), ue.email, 'User') AS "challengeeName",
       -- today-completion for challenger (scoped to this specific challenge only)
       EXISTS(SELECT 1 FROM one_on_one_logs l WHERE l.challenge_id = c.id AND l.user_id = c.challenger_id AND l.completed_date = $2::date) AS "challengerDoneToday",
       -- today-completion for challengee (scoped to this specific challenge only)
       EXISTS(SELECT 1 FROM one_on_one_logs l WHERE l.challenge_id = c.id AND l.user_id = c.challengee_id AND l.completed_date = $2::date) AS "challengeeDoneToday",
       -- whether the current user already sent a nudge today for this challenge
       EXISTS(SELECT 1 FROM nudges n WHERE n.sender_id = $1 AND n.context_type = '1on1' AND n.context_id = c.id AND n.created_at >= date_trunc('day', NOW() AT TIME ZONE 'UTC')) AS "nudgedTodayByMe"
     FROM one_on_one_challenges c
     JOIN users uc ON uc.id = c.challenger_id
     JOIN users ue ON ue.id = c.challengee_id
     WHERE (c.challenger_id = $1 OR c.challengee_id = $1)
       AND c.status IN ('pending', 'active')
     ORDER BY c.created_at DESC`,
    [userId, today]
  );
  return rows;
}

export async function completeChallengeForToday(challengeId: string, userId: string) {
  const today = new Date().toISOString().split("T")[0];
  await pool.query(
    `INSERT INTO one_on_one_logs (challenge_id, user_id, completed_date)
     VALUES ($1, $2, $3::date)
     ON CONFLICT (challenge_id, user_id, completed_date) DO NOTHING`,
    [challengeId, userId, today]
  );
}

export async function uncompleteChallengeForToday(challengeId: string, userId: string) {
  const today = new Date().toISOString().split("T")[0];
  await pool.query(
    `DELETE FROM one_on_one_logs WHERE challenge_id = $1 AND user_id = $2 AND completed_date = $3::date`,
    [challengeId, userId, today]
  );
}

export async function leaveChallenge(challengeId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT id, challenger_id, challengee_id, status
     FROM one_on_one_challenges
     WHERE id = $1 AND status IN ('pending', 'active')`,
    [challengeId]
  );
  if (!rows.length) throw new Error("Challenge not found or already ended");

  const { challenger_id, challengee_id, status } = rows[0];
  const isParticipant = challenger_id === userId || challengee_id === userId;
  if (!isParticipant) throw new Error("Not a participant in this challenge");

  // Pending: only the challenger can cancel; Active: either participant can leave
  if (status === "pending" && challenger_id !== userId) {
    throw new Error("Only the challenger can cancel a pending challenge");
  }

  await pool.query(
    `UPDATE one_on_one_challenges SET status = 'cancelled' WHERE id = $1`,
    [challengeId]
  );
  return { status: "cancelled" };
}

export async function respondToChallenge(
  challengeId: string,
  userId: string,
  action: "accept" | "reject"
) {
  const { rows } = await pool.query(
    `SELECT id, challengee_id FROM one_on_one_challenges
     WHERE id = $1 AND status = 'pending'`,
    [challengeId]
  );
  if (!rows.length) throw new Error("Challenge not found or not pending");
  if (rows[0].challengee_id !== userId) throw new Error("Not the challengee");

  const newStatus = action === "accept" ? "active" : "rejected";
  await pool.query(
    `UPDATE one_on_one_challenges SET status = $1 WHERE id = $2`,
    [newStatus, challengeId]
  );
  return { status: newStatus };
}
