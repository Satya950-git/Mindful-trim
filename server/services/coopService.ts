import { pool } from "../db";

export async function createCoopGroup(
  creatorId: string,
  name: string,
  habitNames: string[],
  friendIds: string[]
) {
  // Prevent duplicate habit names within the same group (case-insensitive)
  const normalized = habitNames.map(h => h.trim().toLowerCase());
  const seen = new Set<string>();
  for (const h of normalized) {
    if (seen.has(h)) {
      throw new Error("Duplicate habits are not allowed in the same group.");
    }
    seen.add(h);
  }

  // Prevent the same creator from having two groups with the same name (case-insensitive)
  const { rows: existingRows } = await pool.query(
    `SELECT id FROM coop_groups WHERE creator_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [creatorId, name.trim()]
  );
  if (existingRows.length > 0) {
    throw new Error("You already have a group with this name.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: gRows } = await client.query(
      `INSERT INTO coop_groups (creator_id, name)
       VALUES ($1, $2)
       RETURNING id, name, invite_token AS "inviteToken", created_at AS "createdAt"`,
      [creatorId, name.trim().slice(0, 100)]
    );
    const group = gRows[0];

    for (const habitName of habitNames) {
      await client.query(
        `INSERT INTO coop_group_habits (group_id, habit_name) VALUES ($1, $2)`,
        [group.id, habitName.trim().slice(0, 100)]
      );
    }

    await client.query(
      `INSERT INTO coop_group_members (group_id, user_id, status)
       VALUES ($1, $2, 'active')`,
      [group.id, creatorId]
    );

    for (const friendId of friendIds) {
      await client.query(
        `INSERT INTO coop_group_members (group_id, user_id, status)
         VALUES ($1, $2, 'pending')
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [group.id, friendId]
      );
    }

    await client.query("COMMIT");
    return group;
  } catch (err: any) {
    await client.query("ROLLBACK");
    // Unique-violation on (creator_id, lower(name)) index → friendly error
    if (err?.code === "23505" && err?.constraint === "coop_groups_creator_name_uniq") {
      throw new Error("You already have a group with this name.");
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function getCoopGroupsForUser(userId: string) {
  const today = new Date().toISOString().split("T")[0];

  const { rows: groups } = await pool.query(
    `SELECT
       g.id, g.name, g.invite_token AS "inviteToken", g.created_at AS "createdAt",
       g.creator_id AS "creatorId",
       m.status AS "myStatus",
       COALESCE(NULLIF(cu.identity,''), cu.email, 'Someone') AS "creatorName"
     FROM coop_group_members m
     JOIN coop_groups g ON g.id = m.group_id
     JOIN users cu ON cu.id = g.creator_id
     WHERE m.user_id = $1 AND m.status IN ('active','pending')
     ORDER BY g.created_at DESC`,
    [userId]
  );

  // Fetch all group IDs the user has already nudged today (once, for all groups)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { rows: nudgedRows } = await pool.query(
    `SELECT DISTINCT context_id FROM nudges
     WHERE sender_id = $1 AND context_type = 'coop' AND created_at >= $2`,
    [userId, todayStart]
  );
  const nudgedGroupIds = new Set(nudgedRows.map((r: { context_id: string }) => r.context_id));

  const result = [];
  for (const group of groups) {
    // Per-habit rows with per-member completion from coop_habit_completions
    const { rows: habits } = await pool.query(
      `SELECT
         h.id,
         h.habit_name AS "habitName",
         COALESCE(
           json_agg(
             json_build_object(
               'userId', m.user_id,
               'doneToday', CASE WHEN chc.id IS NOT NULL THEN true ELSE false END
             )
           ) FILTER (WHERE m.status = 'active'),
           '[]'::json
         ) AS "memberCompletion"
       FROM coop_group_habits h
       LEFT JOIN coop_group_members m ON m.group_id = h.group_id
       LEFT JOIN coop_habit_completions chc
         ON chc.habit_id = h.id AND chc.user_id = m.user_id AND chc.completed_date = $2
       WHERE h.group_id = $1
       GROUP BY h.id
       ORDER BY h.created_at ASC`,
      [group.id, today]
    );

    const { rows: members } = await pool.query(
      `SELECT
         m2.id, m2.user_id AS "userId", m2.status,
         COALESCE(NULLIF(u.identity,''), u.email, 'User') AS name,
         EXISTS (
           SELECT 1 FROM daily_logs dl
           WHERE dl.user_id = m2.user_id AND dl.date = $2
         ) AS "doneToday"
       FROM coop_group_members m2
       JOIN users u ON u.id = m2.user_id
       WHERE m2.group_id = $1 AND m2.status IN ('active','pending')
       ORDER BY m2.status DESC, m2.created_at ASC`,
      [group.id, today]
    );

    result.push({ ...group, habits, members, nudgedGroupToday: nudgedGroupIds.has(group.id) });
  }
  return result;
}

export async function leaveCoopGroup(groupId: string, userId: string) {
  const { rows } = await pool.query(
    `SELECT id FROM coop_group_members
     WHERE group_id = $1 AND user_id = $2 AND status IN ('active', 'pending')`,
    [groupId, userId]
  );
  if (!rows.length) throw new Error("Not a member of this group");

  // Remove the user's membership
  await pool.query(
    `DELETE FROM coop_group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId]
  );

  // If no active members remain, delete the whole group
  const { rows: remaining } = await pool.query(
    `SELECT id FROM coop_group_members WHERE group_id = $1 AND status = 'active'`,
    [groupId]
  );
  if (remaining.length === 0) {
    await pool.query(`DELETE FROM coop_groups WHERE id = $1`, [groupId]);
  }

  return { success: true };
}

export async function inviteToCoopGroup(
  groupId: string,
  inviterId: string,
  friendId: string
) {
  const { rows: memberRows } = await pool.query(
    `SELECT id FROM coop_group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
    [groupId, inviterId]
  );
  if (!memberRows.length) throw new Error("Not an active member of this group");

  await pool.query(
    `INSERT INTO coop_group_members (group_id, user_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (group_id, user_id) DO NOTHING`,
    [groupId, friendId]
  );
  return { success: true };
}

export async function addHabitToCoopGroup(
  groupId: string,
  userId: string,
  habitName: string
) {
  const { rows: memberRows } = await pool.query(
    `SELECT id FROM coop_group_members WHERE group_id = $1 AND user_id = $2 AND status = 'active'`,
    [groupId, userId]
  );
  if (!memberRows.length) throw new Error("Not an active member of this group");

  const trimmed = habitName.trim().slice(0, 100);
  if (!trimmed) throw new Error("Habit name is required");

  const { rows: dupRows } = await pool.query(
    `SELECT 1 FROM coop_group_habits WHERE group_id = $1 AND LOWER(habit_name) = LOWER($2) LIMIT 1`,
    [groupId, trimmed]
  );
  if (dupRows.length > 0) {
    throw new Error("This habit is already part of the group.");
  }

  const { rows } = await pool.query(
    `INSERT INTO coop_group_habits (group_id, habit_name)
     VALUES ($1, $2)
     RETURNING id, habit_name AS "habitName", created_at AS "createdAt"`,
    [groupId, trimmed]
  );
  return rows[0];
}

export async function deleteHabitFromCoopGroup(
  groupId: string,
  ownerId: string,
  habitId: string
) {
  // Only the group creator (owner) can delete habits
  const { rows: ownerRows } = await pool.query(
    `SELECT id FROM coop_groups WHERE id = $1 AND creator_id = $2`,
    [groupId, ownerId]
  );
  if (!ownerRows.length) throw new Error("Only the group owner can remove habits");

  const { rows: habitRows } = await pool.query(
    `SELECT id FROM coop_group_habits WHERE id = $1 AND group_id = $2`,
    [habitId, groupId]
  );
  if (!habitRows.length) throw new Error("Habit not found in this group");

  await pool.query(`DELETE FROM coop_group_habits WHERE id = $1`, [habitId]);
  return { success: true };
}

export async function removeMemberFromCoopGroup(
  groupId: string,
  ownerId: string,
  memberId: string
) {
  // Only the group creator (owner) can remove members
  const { rows: ownerRows } = await pool.query(
    `SELECT id FROM coop_groups WHERE id = $1 AND creator_id = $2`,
    [groupId, ownerId]
  );
  if (!ownerRows.length) throw new Error("Only the group owner can remove members");

  if (ownerId === memberId) throw new Error("You cannot remove yourself; use Leave Group instead");

  const { rows: memberRows } = await pool.query(
    `SELECT id FROM coop_group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, memberId]
  );
  if (!memberRows.length) throw new Error("Member not found in this group");

  await pool.query(
    `DELETE FROM coop_group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, memberId]
  );
  return { success: true };
}

export async function respondToCoopInvite(
  groupId: string,
  userId: string,
  action: "accept" | "reject"
) {
  const { rows } = await pool.query(
    `SELECT id FROM coop_group_members WHERE group_id = $1 AND user_id = $2 AND status = 'pending'`,
    [groupId, userId]
  );
  if (!rows.length) throw new Error("No pending invite found");

  if (action === "accept") {
    await pool.query(
      `UPDATE coop_group_members SET status = 'active' WHERE id = $1`,
      [rows[0].id]
    );
    return { status: "active" };
  } else {
    await pool.query(`DELETE FROM coop_group_members WHERE id = $1`, [rows[0].id]);
    return { status: "rejected" };
  }
}
