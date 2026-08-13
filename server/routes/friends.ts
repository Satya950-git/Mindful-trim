import type { Express, Request, Response } from "express";
import { pool } from "../db";
import { requireAuth } from "./middleware";
import { sendPushToUser } from "../services/pushService";
import { createNotification } from "../inboxDb";
import { getUserLang, notifStrings, bothLangs1Arg } from "../notificationI18n";

export function registerFriendRoutes(app: Express) {
  // GET /api/friends — accepted friends + incoming pending requests
  app.get('/api/friends', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    try {
      const { rows: accepted } = await pool.query(`
        SELECT
          f.id AS "friendshipId",
          CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END AS "userId",
          COALESCE(NULLIF(u.identity,''), u.email, 'Friend') AS name,
          f.created_at AS "createdAt"
        FROM friendships f
        JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
        WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
        ORDER BY f.created_at DESC
      `, [userId]);

      const { rows: pending } = await pool.query(`
        SELECT
          f.id AS "friendshipId",
          f.requester_id AS "userId",
          COALESCE(NULLIF(u.identity,''), u.email, 'Friend') AS name,
          f.created_at AS "createdAt"
        FROM friendships f
        JOIN users u ON u.id = f.requester_id
        WHERE f.addressee_id = $1 AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `, [userId]);

      // Requests this user sent that are still awaiting a response — used by the
      // client to detect when an outgoing request gets accepted.
      const { rows: outgoing } = await pool.query(`
        SELECT
          f.id AS "friendshipId",
          f.addressee_id AS "userId",
          COALESCE(NULLIF(u.identity,''), u.email, 'Friend') AS name,
          f.created_at AS "createdAt"
        FROM friendships f
        JOIN users u ON u.id = f.addressee_id
        WHERE f.requester_id = $1 AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `, [userId]);

      res.json({ accepted, pending, outgoing });
    } catch (err) {
      console.error('[friends] GET /api/friends error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/friends/request — accept a WhatsApp deep-link invite (direct accepted)
  // Body: { toUserId } — the user who shared the invite link (the "requester")
  // Server handles bi-directionality: creates an accepted friendship immediately.
  app.post('/api/friends/request', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { toUserId } = req.body;

    if (!toUserId || typeof toUserId !== 'string') {
      return res.status(400).json({ error: 'toUserId required' });
    }
    if (toUserId === userId) {
      return res.status(400).json({ error: 'Cannot connect with yourself' });
    }

    const client = await pool.connect();
    try {
      const { rows: userRows } = await client.query('SELECT id FROM users WHERE id = $1', [toUserId]);
      if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });

      const { rows: existing } = await client.query(`
        SELECT id, status FROM friendships
        WHERE (requester_id = $1 AND addressee_id = $2)
           OR (requester_id = $2 AND addressee_id = $1)
      `, [toUserId, userId]);

      if (existing.length > 0) {
        if (existing[0].status === 'accepted') {
          return res.json({ success: true, alreadyFriends: true });
        }
        // Upgrade any pending/declined → accepted
        await client.query('UPDATE friendships SET status = $1 WHERE id = $2', ['accepted', existing[0].id]);
        return res.json({ success: true });
      }

      // Create accepted friendship: inviter (toUserId) is requester, acceptor (userId) is addressee
      await client.query(`
        INSERT INTO friendships (requester_id, addressee_id, status)
        VALUES ($1, $2, 'accepted')
      `, [toUserId, userId]);

      res.json({ success: true });
    } catch (err) {
      console.error('[friends] request error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // POST /api/friends/connect — backward-compat alias (body: { fromUserId })
  app.post('/api/friends/connect', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const fromUserId = req.body.fromUserId;
    if (!fromUserId || typeof fromUserId !== 'string') {
      return res.status(400).json({ error: 'fromUserId required' });
    }
    if (fromUserId === userId) return res.status(400).json({ error: 'Cannot connect with yourself' });
    const client = await pool.connect();
    try {
      const { rows: u } = await client.query('SELECT id FROM users WHERE id=$1', [fromUserId]);
      if (!u.length) return res.status(404).json({ error: 'User not found' });
      const { rows: ex } = await client.query(
        `SELECT id, status FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
        [fromUserId, userId]
      );
      if (ex.length > 0) {
        if (ex[0].status === 'accepted') return res.json({ success: true, alreadyFriends: true });
        await client.query('UPDATE friendships SET status=$1 WHERE id=$2', ['accepted', ex[0].id]);
        return res.json({ success: true });
      }
      await client.query(`INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1,$2,'accepted')`, [fromUserId, userId]);
      res.json({ success: true });
    } catch (err) {
      console.error('[friends] connect error:', err);
      res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // PUT /api/friends/:id/respond — accept or decline a pending request
  app.put('/api/friends/:id/respond', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;
    const { action } = req.body;

    if (action !== 'accept' && action !== 'decline') {
      return res.status(400).json({ error: 'action must be accept or decline' });
    }

    try {
      const { rows } = await pool.query('SELECT * FROM friendships WHERE id = $1', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
      const row = rows[0];
      if (row.addressee_id !== userId) return res.status(403).json({ error: 'Unauthorized' });
      if (row.status !== 'pending') return res.status(400).json({ error: 'Not a pending request' });

      const status = action === 'accept' ? 'accepted' : 'declined';
      await pool.query('UPDATE friendships SET status = $1 WHERE id = $2', [status, id]);

      // Notify the original requester that their request was accepted
      if (action === 'accept') {
        const [acceptorRows, requesterLang] = await Promise.all([
          pool.query(
            `SELECT COALESCE(NULLIF(identity,''), email, 'Someone') AS name FROM users WHERE id = $1`,
            [userId]
          ),
          getUserLang(row.requester_id),
        ]);
        const acceptorName: string = acceptorRows.rows[0]?.name ?? 'Someone';
        const acceptBoth = bothLangs1Arg('friendAccepted', acceptorName);
        const acceptTitle = acceptBoth[requesterLang === 'hi' ? 'titleHi' : 'titleEn'];
        const acceptMsg = acceptBoth[requesterLang === 'hi' ? 'msgHi' : 'msgEn'];
        sendPushToUser(row.requester_id, {
          title: acceptTitle,
          body: acceptMsg,
          data: { screen: 'social' },
        });
        createNotification({ userId: row.requester_id, title: acceptBoth.titleEn, message: acceptBoth.msgEn, titleHi: acceptBoth.titleHi, messageHi: acceptBoth.msgHi, type: 'GENERAL' }).catch(() => {});
      }

      res.json({ success: true, status });
    } catch (err) {
      console.error('[friends] respond error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/friends/search?username=X&tag=Y — find a user by Riot-style ID
  app.get('/api/friends/search', requireAuth, async (req: Request, res: Response) => {
    const { username, tag } = req.query;
    if (!username || !tag || typeof username !== 'string' || typeof tag !== 'string') {
      return res.status(400).json({ error: 'username and tag are required' });
    }
    try {
      const { rows } = await pool.query(
        `SELECT id, identity AS username, unique_tag AS "uniqueTag", profile_photo AS "profilePhoto"
         FROM users
         WHERE identity = $1 AND upper(unique_tag) = upper($2)
         LIMIT 1`,
        [username, tag]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const found = rows[0];
      if (found.id === req.userId) return res.status(400).json({ error: 'Cannot search for yourself' });
      return res.json(found);
    } catch (err) {
      console.error('[friends] search error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/friends/search-email?email=X — find a user by email address (exact, case-insensitive)
  app.get('/api/friends/search-email', requireAuth, async (req: Request, res: Response) => {
    const { email } = req.query;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'email is required' });
    }
    const normalized = email.trim().toLowerCase();
    try {
      const { rows } = await pool.query(
        `SELECT id, COALESCE(NULLIF(identity,''), 'Member') AS username, unique_tag AS "uniqueTag", profile_photo AS "profilePhoto"
         FROM users
         WHERE lower(email) = $1
         LIMIT 1`,
        [normalized]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
      const found = rows[0];
      if (found.id === req.userId) return res.status(400).json({ error: 'Cannot search for yourself' });

      const { rows: existing } = await pool.query(
        `SELECT status FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)`,
        [req.userId, found.id]
      );
      let relationship: 'none' | 'pending' | 'accepted' = 'none';
      if (existing.length > 0) {
        relationship = existing[0].status === 'accepted' ? 'accepted' : existing[0].status === 'pending' ? 'pending' : 'none';
      }

      return res.json({ ...found, relationship });
    } catch (err) {
      console.error('[friends] search-email error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // GET /api/friends/discover — browse other app users who aren't friends yet and have no pending request
  app.get('/api/friends/discover', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const limitRaw = parseInt(String(req.query.limit ?? '20'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
    try {
      const { rows } = await pool.query(
        `SELECT u.id, COALESCE(NULLIF(u.identity,''), 'Member') AS username, u.unique_tag AS "uniqueTag", u.profile_photo AS "profilePhoto"
         FROM users u
         WHERE u.id != $1
           AND NOT EXISTS (
             SELECT 1 FROM friendships f
             WHERE ((f.requester_id = $1 AND f.addressee_id = u.id)
                OR (f.requester_id = u.id AND f.addressee_id = $1))
               AND f.status IN ('accepted', 'pending')
           )
         ORDER BY u.created_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      return res.json({ users: rows });
    } catch (err) {
      console.error('[friends] discover error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  // POST /api/friends/pending-request — send an in-app friend request (creates pending friendship)
  app.post('/api/friends/pending-request', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { toUserId } = req.body;
    if (!toUserId || typeof toUserId !== 'string') {
      return res.status(400).json({ error: 'toUserId required' });
    }
    if (toUserId === userId) return res.status(400).json({ error: 'Cannot send a request to yourself' });
    const client = await pool.connect();
    try {
      const { rows: userRows } = await client.query(
        `SELECT id, COALESCE(NULLIF(identity,''), email, 'Someone') AS name FROM users WHERE id = $1`,
        [toUserId]
      );
      if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
      const { rows: senderRows } = await client.query(
        `SELECT COALESCE(NULLIF(identity,''), email, 'Someone') AS name FROM users WHERE id = $1`,
        [userId]
      );
      const senderName: string = senderRows[0]?.name ?? 'Someone';

      const { rows: existing } = await client.query(
        `SELECT id, status FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
        [userId, toUserId]
      );
      const recipientLang = await getUserLang(toUserId);
      const frBoth = bothLangs1Arg('friendRequest', senderName);
      const frTitle = frBoth[recipientLang === 'hi' ? 'titleHi' : 'titleEn'];
      const frMsg = frBoth[recipientLang === 'hi' ? 'msgHi' : 'msgEn'];

      if (existing.length > 0) {
        if (existing[0].status === 'accepted') return res.json({ success: true, alreadyFriends: true });
        if (existing[0].status === 'pending') return res.json({ success: true, alreadyRequested: true });
        await client.query('UPDATE friendships SET status=$1, requester_id=$2, addressee_id=$3 WHERE id=$4', ['pending', userId, toUserId, existing[0].id]);
        const friendshipId = existing[0].id;
        sendPushToUser(toUserId, {
          title: frTitle,
          body: frMsg,
          data: { screen: 'friend-request', fromUserId: userId, fromName: senderName },
        });
        createNotification({ userId: toUserId, title: frBoth.titleEn, message: frBoth.msgEn, titleHi: frBoth.titleHi, messageHi: frBoth.msgHi, type: 'GENERAL', challengeType: 'friend-request', challengeId: friendshipId }).catch(() => {});
        return res.json({ success: true });
      }
      const { rows: inserted } = await client.query(
        `INSERT INTO friendships (requester_id, addressee_id, status) VALUES ($1, $2, 'pending') RETURNING id`,
        [userId, toUserId]
      );
      const newFriendshipId = inserted[0]?.id;
      sendPushToUser(toUserId, {
        title: frTitle,
        body: frMsg,
        data: { screen: 'friend-request', fromUserId: userId, fromName: senderName },
      });
      createNotification({ userId: toUserId, title: frBoth.titleEn, message: frBoth.msgEn, titleHi: frBoth.titleHi, messageHi: frBoth.msgHi, type: 'GENERAL', challengeType: 'friend-request', challengeId: newFriendshipId }).catch(() => {});
      return res.json({ success: true });
    } catch (err) {
      console.error('[friends] pending-request error:', err);
      return res.status(500).json({ error: 'Server error' });
    } finally {
      client.release();
    }
  });

  // DELETE /api/friends/:id — remove a friend or cancel a request
  app.delete('/api/friends/:id', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId!;
    const { id } = req.params;

    try {
      const { rows } = await pool.query('SELECT * FROM friendships WHERE id = $1', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
      const row = rows[0];
      if (row.requester_id !== userId && row.addressee_id !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      await pool.query('DELETE FROM friendships WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[friends] delete error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });
}
