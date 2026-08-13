/**
 * notificationI18n.ts
 *
 * Server-side translation helper for notification titles and bodies.
 * Generates text in the recipient's preferred language (en or hi).
 */

import { pool } from "./db";
import { HABITS } from "../data/habitsData";

/** Look up the Hindi habit name given its English name. Falls back to English if not found. */
export function getHabitNameHi(englishName: string): string {
  const found = HABITS.find(h => h.habitName === englishName);
  return found?.habitNameHi ?? englishName;
}

export type Lang = "en" | "hi";

export function getLang(lang: string | null | undefined): Lang {
  return lang === "hi" ? "hi" : "en";
}

/** Look up a user's preferred language from the database. */
export async function getUserLang(userId: string): Promise<Lang> {
  try {
    const { rows } = await pool.query(
      `SELECT language FROM users WHERE id = $1`,
      [userId]
    );
    return getLang(rows[0]?.language);
  } catch {
    return "en";
  }
}

// ---------------------------------------------------------------------------
// Translation strings
// ---------------------------------------------------------------------------

export const notifStrings = {
  friendRequest: {
    title: { en: "New friend request 👋", hi: "नई मित्र अनुरोध 👋" },
    body:  {
      en: (name: string) => `${name} sent you a friend request`,
      hi: (name: string) => `${name} ने आपको मित्र अनुरोध भेजा है`,
    },
  },
  friendAccepted: {
    title: { en: "Friend request accepted 🎉", hi: "मित्र अनुरोध स्वीकार 🎉" },
    body:  {
      en: (name: string) => `${name} accepted your friend request`,
      hi: (name: string) => `${name} ने आपका मित्र अनुरोध स्वीकार किया`,
    },
  },
  oneOnOneInvite: {
    title: { en: "1-on-1 Challenge Invite 🤝", hi: "1-ऑन-1 चुनौती आमंत्रण 🤝" },
    body:  {
      en: (name: string, habit: string) => `${name} challenged you to: ${habit}`,
      hi: (name: string, habit: string) => `${name} ने आपको चुनौती दी: ${habit}`,
    },
  },
  groupInvite: {
    title: { en: "Group Invitation 🎯", hi: "समूह आमंत्रण 🎯" },
    body:  {
      en: (name: string, group: string) =>
        `${name} invited you to join the group habits "${group}".`,
      hi: (name: string, group: string) =>
        `${name} ने आपको "${group}" समूह दिनचर्या में शामिल होने के लिए आमंत्रित किया।`,
    },
  },
  oneOnOneNudge: {
    title: { en: "Accountability Nudge 👊", hi: "जवाबदेही अनुस्मारक 👊" },
    body:  {
      en: (name: string, habit: string) =>
        `${name} is waiting for you to complete your habit: ${habit}!`,
      hi: (name: string, habit: string) =>
        `${name} आपकी प्रतीक्षा कर रहे हैं कि आप अपनी आदत पूरी करें: ${habit}!`,
    },
  },
  groupNudge: {
    title: { en: "Group Accountability Nudge 👊", hi: "समूह जवाबदेही अनुस्मारक 👊" },
    body:  {
      en: (name: string) =>
        `${name} and the group are waiting for you to complete your habits!`,
      hi: (name: string) =>
        `${name} और समूह आपकी प्रतीक्षा कर रहे हैं कि आप अपनी दिनचर्या पूरी करें!`,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Helper: generate both EN and HI versions at once
// ---------------------------------------------------------------------------

type BothLangs = { titleEn: string; titleHi: string; msgEn: string; msgHi: string };

export function bothLangs1Arg(
  key: "friendRequest" | "friendAccepted",
  arg: string
): BothLangs {
  const s = notifStrings[key];
  return {
    titleEn: s.title.en,
    titleHi: s.title.hi,
    msgEn: s.body.en(arg),
    msgHi: s.body.hi(arg),
  };
}

export function bothLangs2Args(
  key: "oneOnOneInvite" | "groupInvite" | "oneOnOneNudge",
  arg1: string,
  arg2: string,
  arg2Hi?: string,
): BothLangs {
  const s = notifStrings[key];
  return {
    titleEn: s.title.en,
    titleHi: s.title.hi,
    msgEn: s.body.en(arg1, arg2),
    msgHi: s.body.hi(arg1, arg2Hi ?? arg2),
  };
}

export function bothLangsGroupNudge(senderName: string): BothLangs {
  const s = notifStrings.groupNudge;
  return {
    titleEn: s.title.en,
    titleHi: s.title.hi,
    msgEn: s.body.en(senderName),
    msgHi: s.body.hi(senderName),
  };
}
