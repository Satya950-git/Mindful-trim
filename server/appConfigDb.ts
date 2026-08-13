/**
 * appConfigDb.ts
 *
 * DB-backed replacement for appConfigFile.ts.
 * Config values are stored as key-value rows in the `app_config` table.
 * Changes via PATCH /api/config persist to the database and are instantly
 * visible to the live deployed server — no file edits or redeployments needed.
 *
 * Priority chain for appStoreUrl:
 *   1. app_config table (runtime-editable via PATCH /api/config)
 *   2. APP_STORE_URL environment variable (legacy override)
 *   3. null (the mobile hook supplies its own hardcoded fallback)
 */

import { eq } from "drizzle-orm";
import { db } from "./db";
import { appConfig } from "@shared/schema";

export interface AppConfig {
  appStoreUrl?: string | null;
  [key: string]: unknown;
}

/**
 * Read all config entries and return them as a flat object.
 */
export async function readAppConfig(): Promise<AppConfig> {
  try {
    const rows = await db.select().from(appConfig);
    const result: AppConfig = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Return the app store / Play Store URL.
 * Priority: DB row → APP_STORE_URL env var → null
 */
export async function getAppStoreUrl(): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(appConfig)
      .where(eq(appConfig.key, "appStoreUrl"))
      .limit(1);
    if (rows.length > 0 && rows[0].value) return rows[0].value;
  } catch {
    // fall through to env var
  }
  return process.env.APP_STORE_URL || null;
}

/**
 * Upsert the given key-value pairs into app_config.
 * Null values are skipped (use the key's absence to represent "unset").
 * Returns the full config after the update.
 */
export async function updateAppConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) continue;
    await db
      .insert(appConfig)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value: String(value), updatedAt: new Date() },
      });
  }
  return readAppConfig();
}
