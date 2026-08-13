import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireAuth } from "./middleware";
import { moderateContent } from "./moderation";

export function registerCommunityRoutes(app: Express) {

  // POST /api/communities — create a community; creator becomes owner + active member
  app.post('/api/communities', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { name, description, pillar } = req.body;

    if (!name || !pillar) return res.status(400).json({ error: 'name and pillar required' });
    const validPillars = ['Mental', 'Physical', 'Social', 'Spiritual'];
    if (!validPillars.includes(pillar)) return res.status(400).json({ error: 'Invalid pillar' });

    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `INSERT INTO communities (name, description, pillar, creator_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, description, pillar, invite_token AS "inviteToken", created_at AS "createdAt"`,
        [name.trim().slice(0, 100), (description ?? '').trim().slice(0, 300), pillar, userId]
      );
      const community = rows[0];
      await client.query(
        `INSERT INTO community_members (community_id, user_id, role, status, joined_at)
         VALUES ($1, $2, 'owner', 'active', NOW())`,
        [community.id, userId]
      );
      return res.status(201).json(community);
    } catch (err) {
      console.error('[communities] create error:', err);
      return res.status(500).json({ error: 'Failed to create community' });
    } finally {
      client.release();
    }
  });

  // GET /api/communities — communities the user is a member of
  app.get('/api/communities', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const { rows } = await pool.query(`
        SELECT
          c.id, c.name, c.description, c.pillar,
          c.invite_token AS "inviteToken",
          c.created_at AS "createdAt",
          cm.role, cm.status AS "myStatus",
          (SELECT COUNT(*)::int FROM community_members cm2
           WHERE cm2.community_id = c.id AND cm2.status = 'active') AS "memberCount",
          (SELECT COUNT(*)::int FROM community_posts cp
           WHERE cp.community_id = c.id) AS "postCount",
          (SELECT COUNT(*)::int FROM community_members cm3
           WHERE cm3.community_id = c.id AND cm3.status = 'pending' AND cm.role = 'owner') AS "pendingCount"
        FROM community_members cm
        JOIN communities c ON c.id = cm.community_id
        WHERE cm.user_id = $1
        ORDER BY c.created_at DESC
      `, [userId]);
      return res.json(rows);
    } catch (err) {
      console.error('[communities] list error:', err);
      return res.status(500).json({ error: 'Failed to fetch communities' });
    }
  });

  // GET /api/communities/join/:token — get community info for join screen (auth required)
  app.get('/api/communities/join/:token', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { token } = req.params;
    try {
      const { rows } = await pool.query(
        `SELECT c.id, c.name, c.description, c.pillar,
                (SELECT COUNT(*)::int FROM community_members cm WHERE cm.community_id = c.id AND cm.status = 'active') AS "memberCount"
         FROM communities c WHERE c.invite_token = $1`,
        [token]
      );
      if (!rows.length) return res.status(404).json({ error: 'Community not found' });
      const community = rows[0];
      const { rows: existing } = await pool.query(
        `SELECT status FROM community_members WHERE community_id = $1 AND user_id = $2`,
        [community.id, userId]
      );
      return res.json({ ...community, myStatus: existing[0]?.status ?? null });
    } catch (err) {
      console.error('[communities] join-info error:', err);
      return res.status(500).json({ error: 'Failed to fetch community' });
    }
  });

  // POST /api/communities/join/:token — request to join (creates pending member)
  app.post('/api/communities/join/:token', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { token } = req.params;
    try {
      const { rows: cRows } = await pool.query(
        `SELECT id FROM communities WHERE invite_token = $1`, [token]
      );
      if (!cRows.length) return res.status(404).json({ error: 'Community not found' });
      const communityId = cRows[0].id;

      const { rows: existing } = await pool.query(
        `SELECT id, status FROM community_members WHERE community_id = $1 AND user_id = $2`,
        [communityId, userId]
      );
      if (existing.length) {
        return res.json({ success: true, status: existing[0].status });
      }

      await pool.query(
        `INSERT INTO community_members (community_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'pending')`,
        [communityId, userId]
      );
      return res.json({ success: true, status: 'pending' });
    } catch (err) {
      console.error('[communities] join error:', err);
      return res.status(500).json({ error: 'Failed to join community' });
    }
  });

  // GET /api/communities/:id — community detail + recent posts (active members only)
  app.get('/api/communities/:id', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      const { rows: cRows } = await pool.query(
        `SELECT c.id, c.name, c.description, c.pillar, c.invite_token AS "inviteToken",
                c.creator_id AS "creatorId", c.created_at AS "createdAt"
         FROM communities c WHERE c.id = $1`, [id]
      );
      if (!cRows.length) return res.status(404).json({ error: 'Community not found' });

      const { rows: mRows } = await pool.query(
        `SELECT role, status FROM community_members WHERE community_id = $1 AND user_id = $2`,
        [id, userId]
      );
      if (!mRows.length || mRows[0].status !== 'active') {
        return res.status(403).json({ error: 'Not an active member of this community' });
      }

      const { rows: posts } = await pool.query(`
        SELECT
          p.id, p.body, p.created_at AS "createdAt",
          p.author_id AS "authorId",
          COALESCE(NULLIF(u.identity,''), u.email, 'Member') AS "authorName"
        FROM community_posts p
        JOIN users u ON u.id = p.author_id
        WHERE p.community_id = $1 AND p.is_flagged = FALSE
        ORDER BY p.created_at DESC
        LIMIT 50
      `, [id]);

      const pendingCount = mRows[0].role === 'owner'
        ? (await pool.query(
            `SELECT COUNT(*)::int AS cnt FROM community_members WHERE community_id = $1 AND status = 'pending'`,
            [id]
          )).rows[0].cnt
        : 0;

      const memberCount = (await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM community_members WHERE community_id = $1 AND status = 'active'`,
        [id]
      )).rows[0].cnt;

      return res.json({
        ...cRows[0],
        myRole: mRows[0].role,
        memberCount,
        posts,
        pendingCount,
      });
    } catch (err) {
      console.error('[communities] detail error:', err);
      return res.status(500).json({ error: 'Failed to fetch community' });
    }
  });

  // GET /api/communities/:id/members — all members
  // Active members see active members (paginated + searchable)
  // Owners additionally see pending members when ?pending=true
  app.get('/api/communities/:id/members', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const search = ((req.query.search as string) || '').trim();
    const showPending = req.query.pending === 'true';
    const PAGE_SIZE = 20;
    const offset = (page - 1) * PAGE_SIZE;

    try {
      const { rows: mRows } = await pool.query(
        `SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = 'active'`,
        [id, userId]
      );
      if (!mRows.length) return res.status(403).json({ error: 'Not an active member' });

      const isOwner = mRows[0].role === 'owner';

      // Pending requests: owner only, no pagination needed
      if (showPending && isOwner) {
        const { rows } = await pool.query(`
          SELECT cm.id, cm.user_id AS "userId", cm.role, cm.status, cm.joined_at AS "joinedAt",
                 COALESCE(NULLIF(u.identity,''), u.email, 'Member') AS name,
                 u.profile_photo AS "avatarUrl"
          FROM community_members cm
          JOIN users u ON u.id = cm.user_id
          WHERE cm.community_id = $1 AND cm.status = 'pending'
          ORDER BY cm.joined_at ASC NULLS LAST
        `, [id]);
        return res.json({ members: rows, total: rows.length, page: 1, pageSize: rows.length, hasMore: false });
      }

      const searchClause = search ? `AND COALESCE(NULLIF(u.identity,''), u.email, 'Member') ILIKE $2` : '';
      const listParams: (string | number)[] = search ? [id, `%${search}%`] : [id];
      const countParams: string[] = search ? [id, `%${search}%`] : [id];

      const { rows } = await pool.query(`
        SELECT cm.id, cm.user_id AS "userId", cm.role, cm.status, cm.joined_at AS "joinedAt",
               COALESCE(NULLIF(u.identity,''), u.email, 'Member') AS name,
               u.profile_photo AS "avatarUrl"
        FROM community_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.community_id = $1 AND cm.status = 'active' ${searchClause}
        ORDER BY CASE WHEN cm.role = 'owner' THEN 0 ELSE 1 END, cm.joined_at ASC NULLS LAST
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `, listParams);

      const { rows: countRows } = await pool.query(`
        SELECT COUNT(*)::int AS total
        FROM community_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.community_id = $1 AND cm.status = 'active' ${searchClause}
      `, countParams);

      return res.json({
        members: rows,
        total: countRows[0].total,
        page,
        pageSize: PAGE_SIZE,
        hasMore: offset + rows.length < countRows[0].total,
      });
    } catch (err) {
      console.error('[communities] members error:', err);
      return res.status(500).json({ error: 'Failed to fetch members' });
    }
  });

  // PUT /api/communities/:id/members/:memberId — approve or decline pending member (owner only)
  app.put('/api/communities/:id/members/:memberId', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id, memberId } = req.params;
    const { action } = req.body;
    if (!['approve', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be approve or decline' });

    try {
      const { rows: ownerRows } = await pool.query(
        `SELECT id FROM community_members WHERE community_id = $1 AND user_id = $2 AND role = 'owner' AND status = 'active'`,
        [id, userId]
      );
      if (!ownerRows.length) return res.status(403).json({ error: 'Owner only' });

      if (action === 'approve') {
        await pool.query(
          `UPDATE community_members SET status = 'active', joined_at = NOW() WHERE id = $1 AND community_id = $2 AND status = 'pending'`,
          [memberId, id]
        );
      } else {
        await pool.query(
          `DELETE FROM community_members WHERE id = $1 AND community_id = $2 AND status = 'pending'`,
          [memberId, id]
        );
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('[communities] approve/decline error:', err);
      return res.status(500).json({ error: 'Failed to update member' });
    }
  });

  // POST /api/communities/:id/posts — create a post (active members; moderation check)
  app.post('/api/communities/:id/posts', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { body } = req.body;

    if (!body || typeof body !== 'string') return res.status(400).json({ error: 'body required' });
    const trimmed = body.trim();
    if (!trimmed) return res.status(400).json({ error: 'body required' });
    if (trimmed.length > 500) return res.status(400).json({ error: 'Post must be 500 characters or fewer' });

    try {
      const { rows: mRows } = await pool.query(
        `SELECT id FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = 'active'`,
        [id, userId]
      );
      if (!mRows.length) return res.status(403).json({ error: 'Not an active member' });

      const modResult = moderateContent(trimmed);
      if (modResult.flagged) {
        return res.status(422).json({
          error: 'Your post violates community guidelines and could not be published.',
          flagged: true,
        });
      }

      const { rows } = await pool.query(
        `INSERT INTO community_posts (community_id, author_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, body, created_at AS "createdAt", author_id AS "authorId"`,
        [id, userId, trimmed]
      );
      const post = rows[0];
      const { rows: uRows } = await pool.query(
        `SELECT COALESCE(NULLIF(identity,''), email, 'Member') AS "authorName" FROM users WHERE id = $1`,
        [userId]
      );
      return res.status(201).json({ ...post, authorName: uRows[0]?.authorName ?? 'Member' });
    } catch (err) {
      console.error('[communities] post create error:', err);
      return res.status(500).json({ error: 'Failed to create post' });
    }
  });

  // DELETE /api/communities/:id/leave — leave a community
  app.delete('/api/communities/:id/leave', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    try {
      const { rows: mRows } = await pool.query(
        `SELECT id, role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = 'active'`,
        [id, userId]
      );
      if (!mRows.length) return res.status(404).json({ error: 'You are not a member of this community' });

      if (mRows[0].role === 'owner') {
        const { rows: ownerCountRows } = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM community_members WHERE community_id = $1 AND role = 'owner' AND status = 'active'`,
          [id]
        );
        if (ownerCountRows[0].cnt <= 1) {
          return res.status(400).json({ error: 'You are the only owner. Promote another member to owner before leaving.' });
        }
      }

      await pool.query(
        `DELETE FROM community_members WHERE community_id = $1 AND user_id = $2`,
        [id, userId]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error('[communities] leave error:', err);
      return res.status(500).json({ error: 'Failed to leave community' });
    }
  });

  // DELETE /api/communities/:id/posts/:postId — delete post (owner or post author)
  app.delete('/api/communities/:id/posts/:postId', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id, postId } = req.params;
    try {
      const { rows: pRows } = await pool.query(
        `SELECT author_id FROM community_posts WHERE id = $1 AND community_id = $2`,
        [postId, id]
      );
      if (!pRows.length) return res.status(404).json({ error: 'Post not found' });

      const isAuthor = pRows[0].author_id === userId;
      if (!isAuthor) {
        const { rows: ownerRows } = await pool.query(
          `SELECT id FROM community_members WHERE community_id = $1 AND user_id = $2 AND role = 'owner' AND status = 'active'`,
          [id, userId]
        );
        if (!ownerRows.length) return res.status(403).json({ error: 'Unauthorized' });
      }

      await pool.query(`DELETE FROM community_posts WHERE id = $1`, [postId]);
      return res.json({ success: true });
    } catch (err) {
      console.error('[communities] post delete error:', err);
      return res.status(500).json({ error: 'Failed to delete post' });
    }
  });
}
