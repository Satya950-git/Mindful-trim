/**
 * notificationService.ts
 *
 * CSV-driven notification system + Expo push token registration.
 *
 * The backend's Notification.csv is the single source of truth for daily reminders.
 * This service:
 *   1. Fetches active notification rows from GET /api/notifications
 *   2. Compares them against what is currently scheduled locally
 *   3. Schedules new/updated notifications and cancels removed ones
 *   4. Persists a mapping of { csvRowKey → expoNotificationId } in AsyncStorage
 *      to prevent duplicates across app launches
 *   5. Registers the device's Expo push token with the backend after login
 *      so the server can send friend request / acceptance notifications.
 *
 * Synchronization runs:
 *   - On app startup (initNotifications)
 *   - When the app returns to the foreground (AppState listener in initNotifications)
 *   - On explicit call to syncNotifications (e.g. after auth)
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiUrl, apiRequest } from '@/lib/query-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOTIFICATIONS_ENABLED_KEY = '@mindful_trim_notifications_enabled';
/** Maps a stable CSV row key → Expo scheduled notification identifier */
const NOTIFICATION_MAP_KEY = '@mindful_trim_notification_map';
/** Maps habit_id → Expo scheduled notification identifier for per-habit reminders */
const HABIT_REMINDER_MAP_KEY = '@mindful_trim_habit_reminder_map';
/** Set of inbox item IDs that have already triggered a local notification */
const SEEN_INBOX_IDS_KEY = '@mindful_trim_seen_inbox_ids';
const INBOX_POLL_INTERVAL_MS = 30_000;

/** Time-block → hour-of-day for habit reminder scheduling */
const TIME_BLOCK_HOUR: Record<string, number> = {
  Morning: 8,
  Workday: 12,
  Evening: 18,
  Lifestyle: 20,
};

/** Habit reminder body text per language */
const HABIT_REMINDER_BODY: Record<string, (name: string, nameHi?: string) => string> = {
  en: (name) => `Time for: ${name}`,
  hi: (name, nameHi) => nameHi ? `${nameHi} करने का समय है` : `Time for: ${name}`,
};

// ---------------------------------------------------------------------------
// Foreground handler — show banners even when the app is open
// ---------------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CsvNotificationRow {
  id: number;
  time_slot: string;   // e.g. "08:00"
  message_text: string;
  is_active: boolean;
}

/** Keyed by a stable string derived from the CSV row so we can detect changes */
type NotificationMap = Record<string, string>; // csvRowKey → expoId

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a stable key that uniquely identifies a CSV notification row.
 * Using id + time_slot + a hash of message_text keeps it deterministic
 * and change-sensitive (if content changes, the key changes → reschedule).
 */
function rowKey(row: CsvNotificationRow): string {
  return `csv_${row.id}_${row.time_slot}_${hashStr(row.message_text)}`;
}

/** Tiny djb2 hash so we can detect message changes without storing full text */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0; // unsigned
}

/** Parse "HH:MM" into { hour, minute } */
function parseTimeSlot(slot: string): { hour: number; minute: number } | null {
  const parts = slot.split(':');
  if (parts.length !== 2) return null;
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return null;
  return { hour, minute };
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers for the notification map
// ---------------------------------------------------------------------------

async function loadNotificationMap(): Promise<NotificationMap> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_MAP_KEY);
    return raw ? (JSON.parse(raw) as NotificationMap) : {};
  } catch {
    return {};
  }
}

async function saveNotificationMap(map: NotificationMap): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_MAP_KEY, JSON.stringify(map));
}

async function loadHabitReminderMap(): Promise<NotificationMap> {
  try {
    const raw = await AsyncStorage.getItem(HABIT_REMINDER_MAP_KEY);
    return raw ? (JSON.parse(raw) as NotificationMap) : {};
  } catch {
    return {};
  }
}

async function saveHabitReminderMap(map: NotificationMap): Promise<void> {
  await AsyncStorage.setItem(HABIT_REMINDER_MAP_KEY, JSON.stringify(map));
}

// ---------------------------------------------------------------------------
// Fetch CSV rows from the backend
// ---------------------------------------------------------------------------

async function getUserLanguage(): Promise<string> {
  try {
    const lang = await AsyncStorage.getItem('@mindful_trim_language');
    return lang ?? 'en';
  } catch {
    return 'en';
  }
}

/** Translated notification titles for daily reminders */
const REMINDER_TITLES: Record<string, string> = {
  en: 'Mindful Trim',
  hi: 'माइंडफुल ट्रिम',
};

async function fetchRemoteNotifications(): Promise<{ rows: CsvNotificationRow[]; lang: string }> {
  const lang = await getUserLanguage();
  const url = new URL(`/api/notifications?lang=${lang}`, getApiUrl()).toString();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[notificationService] HTTP ${response.status} from /api/notifications`);
  }
  const rows = await response.json() as CsvNotificationRow[];
  return { rows, lang };
}

// ---------------------------------------------------------------------------
// Core synchronization logic
// ---------------------------------------------------------------------------

/**
 * Synchronize local Expo scheduled notifications with the remote CSV.
 *
 * Algorithm:
 *   - Load current map (csvRowKey → expoId) from AsyncStorage
 *   - Fetch active rows from the API
 *   - Build the desired set of keys
 *   - Cancel any previously scheduled notification whose key is no longer in
 *     the desired set (row disabled or removed)
 *   - For new/changed rows, cancel the old notification (if any) and schedule
 *     a fresh one, saving the new expoId
 *   - Persist the updated map
 */
export async function syncNotifications(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  let remoteRows: CsvNotificationRow[];
  let lang: string = 'en';
  try {
    const result = await fetchRemoteNotifications();
    remoteRows = result.rows;
    lang = result.lang;
  } catch (err) {
    // Network or server error — preserve existing local notifications
    console.warn('[notificationService] Sync failed, keeping existing notifications:', err);
    return;
  }

  const notifTitle = REMINDER_TITLES[lang] ?? REMINDER_TITLES.en;
  const map = await loadNotificationMap();
  const desiredKeys = new Set(remoteRows.map(rowKey));

  // --- Step 1: Cancel orphaned notifications (no longer in active CSV) -----
  for (const [key, expoId] of Object.entries(map)) {
    if (!desiredKeys.has(key)) {
      try {
        await Notifications.cancelScheduledNotificationAsync(expoId);
      } catch {
        // Already cancelled or never existed — safe to ignore
      }
      delete map[key];
    }
  }

  // --- Step 2: Schedule new / updated rows ----------------------------------
  for (const row of remoteRows) {
    const key = rowKey(row);
    const time = parseTimeSlot(row.time_slot);
    if (!time) {
      console.warn(`[notificationService] Invalid time_slot "${row.time_slot}" for row ${row.id}`);
      continue;
    }

    if (map[key]) {
      // Already scheduled with this exact content — nothing to do
      continue;
    }

    // Cancel any old version of this row (same id, different content)
    // We identify "same row, different content" by checking all keys for the same id prefix
    const idPrefix = `csv_${row.id}_`;
    for (const [existingKey, expoId] of Object.entries(map)) {
      if (existingKey.startsWith(idPrefix)) {
        try {
          await Notifications.cancelScheduledNotificationAsync(expoId);
        } catch {
          // safe to ignore
        }
        delete map[existingKey];
      }
    }

    // Schedule the notification
    try {
      const expoId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notifTitle,
          body: row.message_text,
          data: { type: 'daily_reminder', csvRowId: row.id, timeSlot: row.time_slot },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: time.hour,
          minute: time.minute,
        },
      });
      map[key] = expoId;
    } catch (err) {
      console.warn(`[notificationService] Failed to schedule row ${row.id}:`, err);
    }
  }

  await saveNotificationMap(map);

  // Also sync per-habit reminders so habit names appear in the correct language
  await syncHabitReminders(lang, notifTitle);
}

// ---------------------------------------------------------------------------
// Per-habit reminder sync
// ---------------------------------------------------------------------------

interface HabitEntry {
  habitId: string;
  timeBlock: string;
  habitName: string;
  habitNameHi?: string;
  isEnabled: boolean;
  notifyEnabled: boolean;
}

/**
 * Schedule one daily OS notification per enabled habit, using the habit's
 * name in the user's chosen language.
 * Called automatically from syncNotifications() so it runs on startup,
 * foreground, and language change.
 */
async function syncHabitReminders(lang: string, notifTitle: string): Promise<void> {
  const apiBase = getApiUrl();
  let habits: HabitEntry[] = [];
  try {
    const url = new URL('/api/habits/my', apiBase).toString();
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return; // not authenticated yet — skip silently
    const data = await res.json() as HabitEntry[];
    habits = Array.isArray(data) ? data : [];
  } catch {
    return; // network error — preserve existing
  }

  const map = await loadHabitReminderMap();
  const bodyFn = HABIT_REMINDER_BODY[lang] ?? HABIT_REMINDER_BODY.en;

  // Build the set of keys we WANT scheduled (enabled habits only)
  const desiredKeys = new Set<string>();
  const enabledHabits = habits.filter(h => h.isEnabled && h.notifyEnabled !== false);
  for (const h of enabledHabits) {
    // Key encodes habitId + language so it changes when user switches language
    desiredKeys.add(`habit_${h.habitId}_${lang}`);
  }

  // Step 1: Cancel orphaned habit notifications
  for (const [key, expoId] of Object.entries(map)) {
    if (!desiredKeys.has(key)) {
      try { await Notifications.cancelScheduledNotificationAsync(expoId); } catch { /* ok */ }
      delete map[key];
    }
  }

  // Step 2: Schedule new / language-changed habit notifications
  for (const h of enabledHabits) {
    const key = `habit_${h.habitId}_${lang}`;
    if (map[key]) continue; // already scheduled in this language

    const hour = TIME_BLOCK_HOUR[h.timeBlock] ?? 8;
    const body = bodyFn(h.habitName, h.habitNameHi);

    try {
      const expoId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notifTitle,
          body,
          data: { type: 'habit_reminder', habitId: h.habitId },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute: 0,
        },
      });
      map[key] = expoId;
    } catch (err) {
      console.warn(`[notificationService] Failed to schedule habit reminder ${h.habitId}:`, err);
    }
  }

  await saveHabitReminderMap(map);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Request push notification permissions from the OS.
 * Returns 'granted' | 'denied' | 'undetermined'.
 * On web or simulators, returns 'denied' gracefully.
 */
export async function requestPermissions(): Promise<Notifications.PermissionStatus> {
  if (Platform.OS === 'web') return 'denied' as Notifications.PermissionStatus;
  if (!Device.isDevice) return 'denied' as Notifications.PermissionStatus;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Mindful Trim',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#9B7DD4',
    });
    // High-importance channel for friend requests and group invites — shows
    // as a heads-up banner even when the screen is on.
    await Notifications.setNotificationChannelAsync('social', {
      name: 'Friend Requests & Invites',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F2836B',
      sound: 'default',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return existingStatus;

  const { status } = await Notifications.requestPermissionsAsync();
  return status;
}

/**
 * Cancel every scheduled notification and clear the local map.
 * Called when the user disables notifications.
 */
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.removeItem(NOTIFICATION_MAP_KEY);
  await AsyncStorage.removeItem(HABIT_REMINDER_MAP_KEY);
}

/**
 * Persist the user's notification preference to AsyncStorage.
 */
export async function saveNotificationPreference(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, JSON.stringify(enabled));
}

/**
 * Read the user's notification preference from AsyncStorage.
 * Returns true by default (first launch assumes opt-in after permission grant).
 */
export async function getNotificationPreference(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (value === null) return true;
    return JSON.parse(value) as boolean;
  } catch {
    return true;
  }
}

/**
 * Full initialization flow called on app startup:
 *   1. Request permission (if not yet determined)
 *   2. If granted and user preference is enabled, sync notifications from CSV
 *   3. If denied or user disabled, cancel all existing ones
 *   4. Register an AppState listener to re-sync whenever the app foregrounds
 */
export async function initNotifications(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  try {
    const status = await requestPermissions();
    const userEnabled = await getNotificationPreference();

    if (status === 'granted' && userEnabled) {
      await syncNotifications();
    } else if (!userEnabled) {
      await cancelAllNotifications();
    }
  } catch {
    // Notification init is non-critical; never crash the app
  }

  // Re-sync whenever the app comes back to the foreground
  AppState.addEventListener('change', (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      getNotificationPreference()
        .then((enabled) => {
          if (enabled) return syncNotifications();
        })
        .catch(() => {});
    }
  });
}

// ---------------------------------------------------------------------------
// Push token registration (for server-sent social notifications)
// ---------------------------------------------------------------------------

/**
 * Get this device's Expo push token and send it to the backend.
 * Call this after the user successfully logs in or registers.
 * Safe to call multiple times — the server upserts.
 * Requires a real device and a configured Expo project ID (production builds).
 * Silently skips in Expo Go (SDK 53+ removed remote push on Android).
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // Expo requires a projectId for getExpoPushTokenAsync.
    // In EAS / Expo Launch builds this is set in app.json under extra.eas.projectId.
    // In Expo Go it is available from Constants.expoConfig.
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      // Running in Expo Go without a project ID — skip silently.
      // Push tokens will register correctly in production builds.
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    await apiRequest('PUT', '/api/auth/push-token', { token });
  } catch (err) {
    // Non-critical — best effort
    console.warn('[notificationService] Failed to register push token:', err);
  }
}

/**
 * Clear the push token from the backend on logout so the user
 * stops receiving notifications on this device.
 */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await apiRequest('PUT', '/api/auth/push-token', { token: null });
  } catch {
    // Non-critical
  }
}

// ---------------------------------------------------------------------------
// Inbox polling — local notifications for invites & requests
// ---------------------------------------------------------------------------

interface InboxItem {
  id: string;
  title: string;
  message: string;
  type: string;
  challengeType: string | null;
  challengeId: string | null;
  isRead: boolean;
}

async function loadSeenInboxIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(SEEN_INBOX_IDS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

async function saveSeenInboxIds(ids: Set<string>): Promise<void> {
  // Cap at 500 most-recent entries to prevent unbounded growth
  const arr = [...ids].slice(-500);
  await AsyncStorage.setItem(SEEN_INBOX_IDS_KEY, JSON.stringify(arr));
}

/** Call on logout to reset the seen-inbox-IDs cache. */
export async function clearSeenInboxIds(): Promise<void> {
  await AsyncStorage.removeItem(SEEN_INBOX_IDS_KEY);
}

/**
 * Check the backend inbox for items the user hasn't been notified about
 * yet and fire a local notification for each one.
 * Works in Expo Go (local notifications, not remote push).
 */
export async function checkAndNotifyInbox(apiBase: string): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const lang = await getUserLanguage();
    const url = new URL(`/api/inbox?limit=20&offset=0&lang=${lang}`, apiBase).toString();
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return;

    const data = (await res.json()) as { items: InboxItem[] };
    const items: InboxItem[] = data.items ?? [];

    const seenIds = await loadSeenInboxIds();
    const newItems = items.filter((item) => !seenIds.has(item.id));
    if (newItems.length === 0) return;

    // Social events get the high-importance channel (heads-up banners on Android)
    const SOCIAL_CHALLENGE_TYPES = new Set(['friend-request', 'coop-invite', 'coop', '1on1']);

    for (const item of newItems) {
      const isSocial = SOCIAL_CHALLENGE_TYPES.has(item.challengeType ?? '');
      const androidChannel = isSocial ? 'social' : 'default';
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: item.title,
            body: item.message,
            data: {
              inboxId: item.id,
              type: item.type,
              challengeType: item.challengeType,
              challengeId: item.challengeId,
            },
            sound: true,
            ...(Platform.OS === 'android' ? { channelId: androidChannel } : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 1,
            repeats: false,
          },
        });
      } catch (err) {
        console.warn('[notificationService] Failed to schedule inbox notification:', err);
      }
      seenIds.add(item.id);
    }

    await saveSeenInboxIds(seenIds);
  } catch (err) {
    console.warn('[notificationService] checkAndNotifyInbox failed:', err);
  }
}

/**
 * Start polling the inbox every 30 s and fire local notifications for new
 * invite / request items.  Returns a cleanup function — call it on logout
 * or component unmount.
 */
export function startInboxPolling(apiBase: string): () => void {
  checkAndNotifyInbox(apiBase).catch(() => {});

  const interval = setInterval(() => {
    checkAndNotifyInbox(apiBase).catch(() => {});
  }, INBOX_POLL_INTERVAL_MS);

  return () => clearInterval(interval);
}
