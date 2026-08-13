/**
 * pushService.ts
 *
 * Sends push notifications to individual users via the Expo Push API.
 * The server looks up the target user's push token from the database,
 * then uses expo-server-sdk to deliver the message.
 *
 * This is a best-effort service — failures are logged but never thrown,
 * so callers (friend request routes, etc.) are not disrupted.
 */

import Expo, { type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { pool } from '../db';

const expo = new Expo({ useFcmV1: true });

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

/**
 * Send a push notification to a single user.
 * Silently skips if the user has no push token or the token is invalid.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<void> {
  try {
    const { rows } = await pool.query(
      'SELECT push_token FROM users WHERE id = $1',
      [userId]
    );
    if (!rows.length || !rows[0].push_token) return;

    const pushToken: string = rows[0].push_token;

    if (!Expo.isExpoPushToken(pushToken)) {
      console.warn(`[pushService] Invalid push token for user ${userId}: ${pushToken}`);
      // Clear stale invalid token
      await pool.query('UPDATE users SET push_token = NULL WHERE id = $1', [userId]);
      return;
    }

    const message: ExpoPushMessage = {
      to: pushToken,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: payload.sound !== undefined ? payload.sound : 'default',
      priority: 'high',
    };

    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      try {
        const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
        for (const ticket of tickets) {
          if (ticket.status === 'error') {
            console.warn('[pushService] Ticket error:', ticket.message, ticket.details);
            // DeviceNotRegistered means the token is stale — clear it
            if (ticket.details?.error === 'DeviceNotRegistered') {
              await pool.query('UPDATE users SET push_token = NULL WHERE id = $1', [userId]);
            }
          }
        }
      } catch (err) {
        console.warn('[pushService] Failed to send chunk:', err);
      }
    }
  } catch (err) {
    // Never propagate — push is non-critical
    console.warn('[pushService] sendPushToUser error:', err);
  }
}

/**
 * Send the same notification to multiple users at once.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  await Promise.all(userIds.map(id => sendPushToUser(id, payload)));
}
