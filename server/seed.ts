/**
 * seed.ts
 *
 * One-time startup seeding for the notifications and app_config tables.
 * Runs automatically when the server starts. Safe to call repeatedly —
 * it only inserts data if the tables are empty, so it never overwrites
 * changes made via the admin API.
 */

import { db } from "./db";
import { pool } from "./db";
import { notifications, appConfig } from "@shared/schema";
import { seedExercises } from "./exerciseSeed";

const INITIAL_NOTIFICATIONS = [
  {
    timeSlot: "08:00",
    messageText:
      "Start your day with intention. Take a 2-minute pause to ground your focus before the rush begins.",
    messageTextHi:
      "इरादे के साथ अपना दिन शुरू करें। भागदौड़ से पहले अपना ध्यान केंद्रित करने के लिए 2 मिनट का विराम लें।",
    isActive: true,
  },
  {
    timeSlot: "08:00",
    messageText:
      "Your day is a blank map. Take 2 minutes to check in with yourself and choose your morning pillar.",
    messageTextHi:
      "आपका दिन एक खाली नक्शा है। खुद से जुड़ने और अपना सुबह का स्तम्भ चुनने के लिए 2 मिनट लें।",
    isActive: true,
  },
  {
    timeSlot: "16:00",
    messageText:
      "Unclench your jaw, drop your shoulders, and step away from the screen for a quick 2-minute physical reset.",
    messageTextHi:
      "अपना जबड़ा ढीला करें, कंधे नीचे करें और त्वरित 2-मिनट के शारीरिक रीसेट के लिए स्क्रीन से दूर हटें।",
    isActive: true,
  },
  {
    timeSlot: "16:00",
    messageText:
      "Break up the afternoon slump. Re-center your energy with a quick, refreshing breathing task.",
    messageTextHi:
      "दोपहर की सुस्ती तोड़ें। एक त्वरित, ताज़गी भरे श्वास अभ्यास से अपनी ऊर्जा पुनः केंद्रित करें।",
    isActive: true,
  },
  {
    timeSlot: "20:00",
    messageText:
      "The busy part of the day is over. Dedicate 2 minutes to gratitude or a gentle mental wind-down.",
    messageTextHi:
      "दिन का व्यस्त हिस्सा खत्म हो गया। कृतज्ञता या हल्के मानसिक विश्राम के लिए 2 मिनट समर्पित करें।",
    isActive: true,
  },
  {
    timeSlot: "20:00",
    messageText:
      "Time to step away from digital noise. Take a brief moment to connect with your inner circle or your spirit.",
    messageTextHi:
      "डिजिटल शोर से दूर होने का समय। अपने करीबियों या अपनी आत्मा से जुड़ने के लिए एक पल निकालें।",
    isActive: true,
  },
];

const INITIAL_APP_CONFIG = [
  {
    key: "appStoreUrl",
    value:
      process.env.APP_STORE_URL ||
      "https://play.google.com/store/apps/details?id=com.mindfultrim.ojas",
  },
];

/** Add message_text_hi column if it doesn't already exist (idempotent). */
async function migrateNotificationsHi(): Promise<void> {
  try {
    await pool.query(
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_text_hi TEXT`
    );
  } catch (err) {
    console.warn("[seed] Could not add message_text_hi column:", err);
  }
}

/** Backfill Hindi translations into existing notification rows that have none. */
async function backfillNotificationsHi(): Promise<void> {
  const translations: Record<string, string> = {
    "Start your day with intention. Take a 2-minute pause to ground your focus before the rush begins.":
      "इरादे के साथ अपना दिन शुरू करें। भागदौड़ से पहले अपना ध्यान केंद्रित करने के लिए 2 मिनट का विराम लें।",
    "Your day is a blank map. Take 2 minutes to check in with yourself and choose your morning pillar.":
      "आपका दिन एक खाली नक्शा है। खुद से जुड़ने और अपना सुबह का स्तम्भ चुनने के लिए 2 मिनट लें।",
    "Unclench your jaw, drop your shoulders, and step away from the screen for a quick 2-minute physical reset.":
      "अपना जबड़ा ढीला करें, कंधे नीचे करें और त्वरित 2-मिनट के शारीरिक रीसेट के लिए स्क्रीन से दूर हटें।",
    "Break up the afternoon slump. Re-center your energy with a quick, refreshing breathing task.":
      "दोपहर की सुस्ती तोड़ें। एक त्वरित, ताज़गी भरे श्वास अभ्यास से अपनी ऊर्जा पुनः केंद्रित करें।",
    "The busy part of the day is over. Dedicate 2 minutes to gratitude or a gentle mental wind-down.":
      "दिन का व्यस्त हिस्सा खत्म हो गया। कृतज्ञता या हल्के मानसिक विश्राम के लिए 2 मिनट समर्पित करें।",
    "Time to step away from digital noise. Take a brief moment to connect with your inner circle or your spirit.":
      "डिजिटल शोर से दूर होने का समय। अपने करीबियों या अपनी आत्मा से जुड़ने के लिए एक पल निकालें।",
  };

  for (const [en, hi] of Object.entries(translations)) {
    try {
      await pool.query(
        `UPDATE notifications SET message_text_hi = $1 WHERE message_text = $2 AND (message_text_hi IS NULL OR message_text_hi = '')`,
        [hi, en]
      );
    } catch {
      // Non-critical
    }
  }
}

export async function seedConfigTables(): Promise<void> {
  // --- Ensure message_text_hi column exists (migration) ---
  await migrateNotificationsHi();

  try {
    // --- Seed notifications only if the table is empty ---
    const existingNotifications = await db.select().from(notifications).limit(1);
    if (existingNotifications.length === 0) {
      await db.insert(notifications).values(INITIAL_NOTIFICATIONS);
      console.log(
        `[seed] Inserted ${INITIAL_NOTIFICATIONS.length} notification rows.`
      );
    } else {
      // Backfill Hindi translations for existing rows
      await backfillNotificationsHi();
    }

    // --- Seed app_config only if the table is empty ---
    const existingConfig = await db.select().from(appConfig).limit(1);
    if (existingConfig.length === 0) {
      await db.insert(appConfig).values(INITIAL_APP_CONFIG);
      console.log(`[seed] Inserted ${INITIAL_APP_CONFIG.length} app_config rows.`);
    }
  } catch (err) {
    // Seeding failure is non-critical — the server continues to start
    console.error("[seed] Config table seeding failed:", err);
  }

  // --- Seed exercise_library ---
  await seedExercises();
}
