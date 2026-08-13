/**
 * notificationDb.ts
 *
 * DB-backed replacement for notificationCsv.ts.
 * All reads and writes go to the `notifications` PostgreSQL table.
 * This means changes are immediately visible to the live deployed server
 * and survive redeployments — no file edits or redeploys required.
 */

import { eq } from "drizzle-orm";
import { db } from "./db";
import { notifications } from "@shared/schema";

export interface NotificationRow {
  id: number;
  time_slot: string;
  message_text: string;
  message_text_hi: string | null;
  is_active: boolean;
}

function toRow(r: typeof notifications.$inferSelect): NotificationRow {
  return {
    id: r.id,
    time_slot: r.timeSlot,
    message_text: r.messageText,
    message_text_hi: r.messageTextHi ?? null,
    is_active: r.isActive,
  };
}

export async function getAllNotifications(): Promise<NotificationRow[]> {
  const rows = await db.select().from(notifications).orderBy(notifications.id);
  return rows.map(toRow);
}

export async function getActiveNotifications(): Promise<NotificationRow[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.isActive, true))
    .orderBy(notifications.id);
  return rows.map(toRow);
}

export async function enableNotification(id: number): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ isActive: true })
    .where(eq(notifications.id, id))
    .returning();
  return result.length > 0;
}

export async function disableNotification(id: number): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ isActive: false })
    .where(eq(notifications.id, id))
    .returning();
  return result.length > 0;
}

export async function updateNotification(
  id: number,
  updates: Partial<Pick<NotificationRow, "time_slot" | "message_text" | "is_active">>
): Promise<boolean> {
  const dbUpdates: Partial<typeof notifications.$inferInsert> = {};
  if (updates.time_slot !== undefined) dbUpdates.timeSlot = updates.time_slot;
  if (updates.message_text !== undefined) dbUpdates.messageText = updates.message_text;
  if (updates.is_active !== undefined) dbUpdates.isActive = updates.is_active;

  const result = await db
    .update(notifications)
    .set(dbUpdates)
    .where(eq(notifications.id, id))
    .returning();
  return result.length > 0;
}
