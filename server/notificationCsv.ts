/**
 * notificationCsv.ts
 *
 * Single source of truth for the Notification.csv file.
 * Reads, parses, and writes the CSV that drives all push notification
 * content and scheduling. Admin endpoints use this module to mutate the CSV;
 * GET /api/notifications reads it via getActiveNotifications().
 */

import fs from "node:fs";
import path from "node:path";

const CSV_PATH = path.join(__dirname, "Notification.csv");

export interface NotificationRow {
  /** Row index (0-based) within the CSV — used as a stable ID */
  id: number;
  /** Time slot, e.g. "08:00", "16:00", "20:00" */
  time_slot: string;
  /** The message body sent to the user's device */
  message_text: string;
  /** Whether this notification should be scheduled */
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a raw CSV string into an array of NotificationRow objects.
 * Handles quoted fields that may contain commas (RFC 4180-ish).
 */
function parseCsv(raw: string): NotificationRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: NotificationRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (values[idx] ?? "").trim();
    });

    rows.push({
      id: i - 1, // 0-based row index (header row is i=0, first data row is i=1)
      time_slot: obj["time_slot"] ?? "",
      message_text: obj["message_text"] ?? "",
      is_active: obj["is_active"]?.toUpperCase() === "TRUE",
    });
  }

  return rows;
}

/**
 * Split a single CSV line respecting double-quoted fields.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside a quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Serialize a NotificationRow value for a CSV cell, adding quotes when needed.
 */
function csvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read and parse the full Notification.csv.
 */
export function getAllNotifications(): NotificationRow[] {
  try {
    const raw = fs.readFileSync(CSV_PATH, "utf-8"); // nosemgrep
    return parseCsv(raw);
  } catch (err) {
    console.error("[notificationCsv] Failed to read CSV:", err);
    return [];
  }
}

/**
 * Return only rows where is_active === true.
 */
export function getActiveNotifications(): NotificationRow[] {
  return getAllNotifications().filter((r) => r.is_active);
}

/**
 * Persist the current rows array back to Notification.csv.
 * The header is always: time_slot,message_text,is_active
 */
function writeCsv(rows: NotificationRow[]): void {
  const header = "time_slot,message_text,is_active";
  const lines = rows.map(
    (r) =>
      `${csvCell(r.time_slot)},${csvCell(r.message_text)},${r.is_active ? "TRUE" : "FALSE"}`
  );
  fs.writeFileSync(CSV_PATH, [header, ...lines].join("\n") + "\n", "utf-8"); // nosemgrep
}

/**
 * Enable a notification row by its 0-based index.
 * Returns false if the index does not exist.
 */
export function enableNotification(id: number): boolean {
  const rows = getAllNotifications();
  if (id < 0 || id >= rows.length) return false;
  rows[id].is_active = true;
  writeCsv(rows);
  return true;
}

/**
 * Disable a notification row by its 0-based index.
 * Returns false if the index does not exist.
 */
export function disableNotification(id: number): boolean {
  const rows = getAllNotifications();
  if (id < 0 || id >= rows.length) return false;
  rows[id].is_active = false;
  writeCsv(rows);
  return true;
}

/**
 * Update the content and/or schedule of a notification row.
 * Only the fields provided in `updates` are changed.
 * Returns false if the index does not exist.
 */
export function updateNotification(
  id: number,
  updates: Partial<Pick<NotificationRow, "time_slot" | "message_text" | "is_active">>
): boolean {
  const rows = getAllNotifications();
  if (id < 0 || id >= rows.length) return false;
  if (updates.time_slot !== undefined) rows[id].time_slot = updates.time_slot;
  if (updates.message_text !== undefined) rows[id].message_text = updates.message_text;
  if (updates.is_active !== undefined) rows[id].is_active = updates.is_active;
  writeCsv(rows);
  return true;
}
