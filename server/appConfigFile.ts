/**
 * appConfigFile.ts
 *
 * Runtime-editable configuration store backed by server/app-config.json.
 *
 * Priority chain for appStoreUrl:
 *   1. app-config.json (runtime-editable — no build required)
 *   2. APP_STORE_URL environment variable (legacy / deployment override)
 *   3. null (frontend hook provides its own hardcoded fallback)
 *
 * The PATCH /api/config endpoint writes here so future URL changes never
 * require a new Expo build, APK/AAB generation, or Play Store release.
 */

import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.join(__dirname, "app-config.json");

export interface AppConfig {
  appStoreUrl?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Load the current config from disk.
 * Returns an empty object if the file does not exist or is malformed.
 */
export function readAppConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8"); // nosemgrep
    return JSON.parse(raw) as AppConfig;
  } catch {
    return {};
  }
}

/**
 * Return the app store / Play Store URL.
 * Priority: file → APP_STORE_URL env var → null
 */
export function getAppStoreUrl(): string | null {
  const file = readAppConfig();
  if (file.appStoreUrl) return file.appStoreUrl;
  return process.env.APP_STORE_URL || null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Merge the given partial config into app-config.json and persist it.
 * Existing keys that are not in `updates` are preserved.
 */
export function updateAppConfig(updates: Partial<AppConfig>): AppConfig {
  const current = readAppConfig();
  const next = { ...current, ...updates };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8"); // nosemgrep
  return next;
}
