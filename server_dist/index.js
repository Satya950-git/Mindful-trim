var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express from "express";

// server/routes.ts
import { createServer } from "node:http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs";
import { SignJWT, jwtVerify } from "jose";

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  dailyLogs: () => dailyLogs,
  exerciseHistory: () => exerciseHistory,
  feedback: () => feedback,
  insertUserSchema: () => insertUserSchema,
  passwordResetTokens: () => passwordResetTokens,
  progressionEvents: () => progressionEvents,
  progressionMilestones: () => progressionMilestones,
  taskInstances: () => taskInstances,
  userState: () => userState,
  users: () => users
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  identity: text("identity").default(""),
  gender: text("gender").default(""),
  tonePreference: text("tone_preference").default(""),
  compass: text("compass").default(""),
  isOnboarded: boolean("is_onboarded").default(false),
  profilePhoto: text("profile_photo").default(""),
  countryCode: text("country_code"),
  phoneNumber: text("phone_number"),
  whatsappOptIn: boolean("whatsapp_opt_in").default(false),
  securityQuestion: text("security_question"),
  securityAnswerHash: text("security_answer_hash"),
  createdAt: timestamp("created_at").defaultNow()
});
var userState = pgTable("user_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  totalDaysAligned: integer("total_days_aligned").default(0),
  lastCompletedTimestamp: text("last_completed_timestamp"),
  lastCompletedDate: text("last_completed_date"),
  lastPillar: text("last_pillar"),
  totalXp: integer("total_xp").default(0),
  currentLevel: integer("current_level").default(0),
  currentPhase: text("current_phase").default("The Arriving"),
  dailyNextsUsed: integer("daily_nexts_used").default(0),
  lastNextDate: text("last_next_date")
});
var progressionEvents = pgTable("progression_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  xpGained: integer("xp_gained").notNull(),
  levelBefore: integer("level_before").notNull(),
  levelAfter: integer("level_after").notNull(),
  phaseBefore: text("phase_before").notNull(),
  phaseAfter: text("phase_after").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var progressionMilestones = pgTable("progression_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  milestoneKey: varchar("milestone_key", { length: 100 }).notNull(),
  levelReached: integer("level_reached").notNull(),
  triggeredAt: timestamp("triggered_at").defaultNow()
});
var exerciseHistory = pgTable("exercise_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  pillar: text("pillar").notNull(),
  usedExerciseIds: jsonb("used_exercise_ids").default([])
});
var dailyLogs = pgTable("daily_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  pillar: text("pillar").notNull(),
  exerciseId: text("exercise_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  difficulty: text("difficulty").default("easy"),
  moodBefore: integer("mood_before").default(5),
  contextTags: jsonb("context_tags").default([]),
  completedAt: text("completed_at").notNull(),
  mode: varchar("mode", { length: 20 }).default("alignment")
});
var taskInstances = pgTable("task_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  exerciseId: text("exercise_id").notNull(),
  exerciseDate: text("exercise_date").notNull(),
  difficulty: text("difficulty").default("easy"),
  xpAwarded: boolean("xp_awarded").default(false),
  isRetry: boolean("is_retry").default(false),
  completedAt: timestamp("completed_at").defaultNow()
});
var feedback = pgTable("feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  appVersion: text("app_version").default("1.0.0"),
  createdAt: timestamp("created_at").defaultNow()
});
var passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true
});

// server/db.ts
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}
var pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : void 0
});
var db = drizzle(pool, { schema: schema_exports });

// server/storage.ts
import { eq, and, ne, gte, lt, sql as sql2 } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// server/progressionEngine.ts
var MAX_LEVEL = 100;
var TOTAL_PRESTIGE_XP = 6e4;
var DAILY_NEXT_LIMIT = 3;
var PHASES = [
  { name: "The Arriving", levelStart: 1, levelEnd: 10, xpPerLevel: 150 },
  { name: "The Seeker", levelStart: 11, levelEnd: 30, xpPerLevel: 300 },
  { name: "The Anchored", levelStart: 31, levelEnd: 60, xpPerLevel: 500 },
  { name: "The Aligned", levelStart: 61, levelEnd: 99, xpPerLevel: 900 },
  { name: "The Axis", levelStart: 100, levelEnd: 100, xpPerLevel: 2400 }
];
function getBaseXpByDifficulty(difficulty) {
  switch ((difficulty ?? "").toLowerCase()) {
    case "easy":
      return 100;
    case "medium":
      return 150;
    case "hard":
      return 200;
    default:
      return 100;
  }
}
function calculateScaledXp(baseXp, currentLevel) {
  return Math.round(baseXp + baseXp * currentLevel * 0.05);
}
function getLevelThresholdXp(level) {
  if (level <= 0) return 0;
  let xp = 0;
  for (const phase of PHASES) {
    if (level < phase.levelStart) break;
    const levelsInPhase = Math.min(level, phase.levelEnd) - phase.levelStart + 1;
    xp += levelsInPhase * phase.xpPerLevel;
  }
  return xp;
}
function calculateLevel(totalXp) {
  let level = 0;
  for (const phase of PHASES) {
    for (let lv = phase.levelStart; lv <= phase.levelEnd; lv++) {
      if (totalXp >= getLevelThresholdXp(lv)) {
        level = lv;
      } else {
        return level;
      }
    }
  }
  return Math.min(level, MAX_LEVEL);
}
function getPhaseForLevel(level) {
  if (level <= 0) return PHASES[0].name;
  for (const phase of PHASES) {
    if (level >= phase.levelStart && level <= phase.levelEnd) {
      return phase.name;
    }
  }
  return PHASES[PHASES.length - 1].name;
}
function getPhaseConfig(level) {
  for (const phase of PHASES) {
    if (level >= phase.levelStart && level <= phase.levelEnd) {
      return phase;
    }
  }
  return PHASES[0];
}
function getPhaseRange(level) {
  const phase = getPhaseConfig(level);
  if (phase.levelStart === phase.levelEnd) return `Level ${phase.levelStart}`;
  return `Levels ${phase.levelStart}\u2013${phase.levelEnd}`;
}
function nextLevelXpRequired(level) {
  if (level >= MAX_LEVEL) return getLevelThresholdXp(MAX_LEVEL);
  return getLevelThresholdXp(level + 1);
}
function levelProgressPercent(totalXp) {
  const level = calculateLevel(totalXp);
  if (level >= MAX_LEVEL) return 100;
  const levelThreshold = getLevelThresholdXp(level);
  const nextThreshold = getLevelThresholdXp(level + 1);
  const xpIntoLevel = totalXp - levelThreshold;
  const xpNeeded = nextThreshold - levelThreshold;
  if (xpNeeded <= 0) return 100;
  return Math.round(xpIntoLevel / xpNeeded * 100);
}
function yearProgressPercent(totalXp) {
  return Math.min(Math.round(totalXp / TOTAL_PRESTIGE_XP * 100 * 10) / 10, 100);
}
function getMilestoneAtLevel(level) {
  if (level === 10) return "phase_arriving_complete";
  if (level === 30) return "phase_seeker_complete";
  if (level === 60) return "phase_anchored_complete";
  if (level === 99) return "phase_aligned_complete";
  if (level === 100) return "prestige_the_axis";
  return null;
}
function getNextMilestone(currentLevel) {
  if (currentLevel < 10) return "phase_arriving_complete";
  if (currentLevel < 30) return "phase_seeker_complete";
  if (currentLevel < 60) return "phase_anchored_complete";
  if (currentLevel < 99) return "phase_aligned_complete";
  if (currentLevel < 100) return "prestige_the_axis";
  return null;
}

// server/storage.ts
var DEFAULT_PHASE = "The Arriving";
async function createUser(email, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  const insertValues = { email, passwordHash };
  const [user] = await db.insert(users).values(insertValues).returning();
  await db.insert(userState).values({ userId: user.id });
  return user;
}
async function getUserByEmail(email) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}
async function getUserByPhone(phoneNumber) {
  const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
  return user;
}
async function getUserById(id) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}
async function verifyPassword(email, password) {
  const user = await getUserByEmail(email);
  if (!user) return { user: null, emailNotFound: true };
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return { user: null, emailNotFound: false };
  return { user, emailNotFound: false };
}
async function completeOnboarding(userId, data) {
  const [updated] = await db.update(users).set({
    identity: data.identity,
    gender: data.gender,
    tonePreference: data.tonePreference,
    compass: data.compass,
    isOnboarded: true
  }).where(eq(users.id, userId)).returning();
  return updated || null;
}
async function updatePassword(email, newPassword) {
  const user = await getUserByEmail(email);
  if (!user) return false;
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  return true;
}
async function changePassword(userId, currentPassword, newPassword) {
  const user = await getUserById(userId);
  if (!user) return { success: false, message: "User not found" };
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) return { success: false, message: "Current password is incorrect" };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  return { success: true, message: "Password updated successfully" };
}
async function setSecurityQuestion(userId, question, answer) {
  const securityAnswerHash = await bcrypt.hash(answer.trim().toLowerCase(), 10);
  await db.update(users).set({ securityQuestion: question, securityAnswerHash }).where(eq(users.id, userId));
}
async function getSecurityQuestionByEmail(email) {
  const user = await getUserByEmail(email);
  if (!user || !user.securityQuestion) return null;
  return user.securityQuestion;
}
async function verifySecurityAnswer(email, answer) {
  const user = await getUserByEmail(email);
  if (!user || !user.securityAnswerHash) return null;
  const match = await bcrypt.compare(answer.trim().toLowerCase(), user.securityAnswerHash);
  if (!match) return null;
  return { userId: user.id };
}
async function updateProfile(userId, data) {
  const updateData = {};
  if (data.identity !== void 0) updateData.identity = data.identity;
  if (data.gender !== void 0) updateData.gender = data.gender;
  if (data.tonePreference !== void 0) updateData.tonePreference = data.tonePreference;
  if (data.compass !== void 0) updateData.compass = data.compass;
  if (data.profilePhoto !== void 0) updateData.profilePhoto = data.profilePhoto;
  if (Object.keys(updateData).length === 0) return { user: await getUserById(userId) ?? null };
  const [updated] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
  return { user: updated || null };
}
async function updatePhone(userId, data) {
  if (data.phoneNumber) {
    const [existing] = await db.select({ id: users.id }).from(users).where(and(eq(users.phoneNumber, data.phoneNumber), ne(users.id, userId)));
    if (existing) {
      return { user: null, error: "This WhatsApp number is already registered to another account." };
    }
  }
  const updateData = {
    countryCode: data.countryCode,
    phoneNumber: data.phoneNumber,
    whatsappOptIn: data.whatsappOptIn
  };
  const [updated] = await db.update(users).set(updateData).where(eq(users.id, userId)).returning();
  return { user: updated || null };
}
var TOKEN_EXPIRY_MS = 15 * 60 * 1e3;
var TOKEN_RATE_LIMIT_MS = 60 * 1e3;
function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}
async function createResetToken(userId) {
  const [existing] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  if (existing && !existing.used && existing.createdAt && Date.now() - existing.createdAt.getTime() < TOKEN_RATE_LIMIT_MS) {
    return { token: "", rateLimited: true };
  }
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({ userId, token: hashedToken, expiresAt, attempts: 0 });
  return { token: rawToken, rateLimited: false };
}
async function verifyResetToken(rawToken) {
  const hashedToken = hashToken(rawToken);
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, hashedToken));
  if (!row || row.used || row.expiresAt < /* @__PURE__ */ new Date()) return { valid: false };
  return { valid: true, userId: row.userId };
}
async function consumeResetToken(rawToken, newPassword) {
  const hashedToken = hashToken(rawToken);
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, hashedToken));
  if (!row || row.used || row.expiresAt < /* @__PURE__ */ new Date()) return { success: false };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, hashedToken));
  return { success: true };
}
async function getState(userId) {
  const [state] = await db.select().from(userState).where(eq(userState.userId, userId));
  return state || null;
}
async function countAlignedDays(userId) {
  const result = await db.execute(
    sql2`SELECT COUNT(DISTINCT exercise_date)::int AS cnt
        FROM task_instances
        WHERE user_id = ${userId}
          AND xp_awarded = true
          AND is_retry = false`
  );
  return result.rows[0]?.cnt ?? 0;
}
async function markTaskCompletedSafely(userId, exerciseId, exerciseDate, difficulty) {
  const existingInstances = await db.select().from(taskInstances).where(
    and(
      eq(taskInstances.userId, userId),
      eq(taskInstances.exerciseDate, exerciseDate)
    )
  );
  const alreadyAwarded = existingInstances.some((i) => i.xpAwarded === true);
  const isRetry = alreadyAwarded;
  const mode = isRetry ? "practice" : "alignment";
  const existing = await getState(userId);
  const currentLevel = existing?.currentLevel ?? 0;
  const baseXp = getBaseXpByDifficulty(difficulty);
  const scaledXp = calculateScaledXp(baseXp, currentLevel);
  const xpToAward = isRetry ? 0 : scaledXp;
  await db.insert(taskInstances).values({
    userId,
    exerciseId,
    exerciseDate,
    difficulty,
    xpAwarded: !isRetry,
    isRetry
  });
  return { xpToAward, isRetry, mode };
}
async function updateState(userId, data, xpToAdd) {
  const existing = await getState(userId);
  let progression = null;
  let progressionFields = {};
  if (xpToAdd && xpToAdd > 0) {
    const currentXp = existing?.totalXp ?? 0;
    const levelBefore = existing?.currentLevel ?? calculateLevel(currentXp);
    const phaseBefore = existing?.currentPhase ?? DEFAULT_PHASE;
    const newTotalXp = currentXp + xpToAdd;
    const newLevel = calculateLevel(newTotalXp);
    const newPhase = getPhaseForLevel(newLevel);
    const levelUp = newLevel > levelBefore;
    const phaseTransition = newPhase !== phaseBefore;
    const isMaxLevel = newLevel >= MAX_LEVEL;
    progressionFields = { totalXp: newTotalXp, currentLevel: newLevel, currentPhase: newPhase };
    await db.insert(progressionEvents).values({
      userId,
      xpGained: xpToAdd,
      levelBefore,
      levelAfter: newLevel,
      phaseBefore,
      phaseAfter: newPhase
    });
    let newMilestoneKey = null;
    if (levelUp) {
      for (let lv = levelBefore + 1; lv <= newLevel; lv++) {
        const key = getMilestoneAtLevel(lv);
        if (key) {
          const existingMilestone = await db.select().from(progressionMilestones).where(and(eq(progressionMilestones.userId, userId), eq(progressionMilestones.milestoneKey, key)));
          if (existingMilestone.length === 0) {
            await db.insert(progressionMilestones).values({
              userId,
              milestoneKey: key,
              levelReached: lv
            });
            newMilestoneKey = key;
          }
        }
      }
    }
    progression = {
      xpGained: xpToAdd,
      totalXp: newTotalXp,
      levelBefore,
      currentLevel: newLevel,
      levelUp,
      phaseBefore,
      currentPhase: newPhase,
      currentPhaseLevelRange: getPhaseRange(newLevel),
      phaseTransition,
      isMaxLevel,
      isPrestige: isMaxLevel,
      newMilestoneKey,
      nextLevelXpRequired: nextLevelXpRequired(newLevel),
      currentLevelProgressPercent: levelProgressPercent(newTotalXp),
      yearProgressPercent: yearProgressPercent(newTotalXp)
    };
  }
  const updateData = { ...data, ...progressionFields };
  if (!existing) {
    const [created] = await db.insert(userState).values({ userId, ...updateData }).returning();
    return { state: created, progression };
  }
  const [updated] = await db.update(userState).set(updateData).where(eq(userState.userId, userId)).returning();
  return { state: updated || null, progression };
}
async function getNextStatus(userId) {
  const state = await getState(userId);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const lastNextDate = state?.lastNextDate;
  const nextsUsed = lastNextDate === today ? state?.dailyNextsUsed ?? 0 : 0;
  return {
    nextsUsed,
    nextsLimit: DAILY_NEXT_LIMIT,
    canNext: nextsUsed < DAILY_NEXT_LIMIT
  };
}
async function recordNext(userId) {
  const state = await getState(userId);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const lastNextDate = state?.lastNextDate;
  const currentNextsUsed = lastNextDate === today ? state?.dailyNextsUsed ?? 0 : 0;
  if (currentNextsUsed >= DAILY_NEXT_LIMIT) {
    return { nextsUsed: currentNextsUsed, nextsLimit: DAILY_NEXT_LIMIT, canNext: false, wasRecorded: false };
  }
  const newNextsUsed = currentNextsUsed + 1;
  if (!state) {
    await db.insert(userState).values({ userId, dailyNextsUsed: newNextsUsed, lastNextDate: today });
  } else {
    await db.update(userState).set({ dailyNextsUsed: newNextsUsed, lastNextDate: today }).where(eq(userState.userId, userId));
  }
  return {
    nextsUsed: newNextsUsed,
    nextsLimit: DAILY_NEXT_LIMIT,
    canNext: newNextsUsed < DAILY_NEXT_LIMIT,
    wasRecorded: true
  };
}
async function backfillProgressionForAllUsers() {
  const allStates = await db.select().from(userState);
  for (const state of allStates) {
    const xp = state.totalXp ?? 0;
    const correctLevel = calculateLevel(xp);
    const correctPhase = getPhaseForLevel(correctLevel);
    const needsUpdate = (state.currentLevel ?? 0) !== correctLevel || (state.currentPhase ?? DEFAULT_PHASE) !== correctPhase;
    if (needsUpdate) {
      await db.update(userState).set({ currentLevel: correctLevel, currentPhase: correctPhase }).where(eq(userState.userId, state.userId));
    }
  }
}
async function getProgressionStatus(userId) {
  const state = await getState(userId);
  if (!state) return null;
  const totalXp = state.totalXp ?? 0;
  const currentLevel = state.currentLevel ?? calculateLevel(totalXp);
  const currentPhase = state.currentPhase ?? DEFAULT_PHASE;
  const currentPhaseLevelRange = getPhaseRange(currentLevel);
  const nextMilestone = getNextMilestone(currentLevel);
  const milestones = await getMilestones(userId);
  const latestUnlockedMilestone = milestones.length > 0 ? milestones[milestones.length - 1].milestoneKey : null;
  return {
    totalXp,
    currentLevel,
    currentPhase,
    currentPhaseName: currentPhase,
    currentPhaseLevelRange,
    xpForNextLevel: nextLevelXpRequired(currentLevel),
    currentLevelProgressPercent: levelProgressPercent(totalXp),
    yearProgressPercent: yearProgressPercent(totalXp),
    completedDaysCount: state.totalDaysAligned ?? 0,
    isMaxLevel: currentLevel >= MAX_LEVEL,
    isPrestige: currentLevel >= MAX_LEVEL,
    nextMilestone,
    latestUnlockedMilestone
  };
}
async function getMilestones(userId) {
  return db.select().from(progressionMilestones).where(eq(progressionMilestones.userId, userId)).orderBy(progressionMilestones.triggeredAt);
}
async function getLogs(userId) {
  return db.select().from(dailyLogs).where(eq(dailyLogs.userId, userId));
}
async function addLog(userId, log2) {
  const [created] = await db.insert(dailyLogs).values({ userId, ...log2 }).returning();
  return created;
}
async function getLast3DaysActivity(userId) {
  const today = /* @__PURE__ */ new Date();
  const dates = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
  }
  const rows = await db.select().from(dailyLogs).where(
    and(
      eq(dailyLogs.userId, userId),
      gte(dailyLogs.date, dates[0])
    )
  );
  return dates.map((date) => {
    const dayRows = rows.filter((r) => r.date === date);
    const alignment = dayRows.filter((r) => !r.mode || r.mode === "alignment").length;
    const practice = dayRows.filter((r) => r.mode === "practice").length;
    return { date, alignment, practice };
  });
}
async function getHistory(userId) {
  const rows = await db.select().from(exerciseHistory).where(eq(exerciseHistory.userId, userId));
  const result = {};
  for (const row of rows) {
    result[row.pillar] = row.usedExerciseIds || [];
  }
  return result;
}
async function updateHistory(userId, pillar, usedExerciseIds) {
  const [existing] = await db.select().from(exerciseHistory).where(and(eq(exerciseHistory.userId, userId), eq(exerciseHistory.pillar, pillar)));
  if (existing) {
    await db.update(exerciseHistory).set({ usedExerciseIds }).where(eq(exerciseHistory.id, existing.id));
  } else {
    await db.insert(exerciseHistory).values({ userId, pillar, usedExerciseIds });
  }
}
async function resetTodayData(userId, todayDate) {
  await db.delete(dailyLogs).where(
    and(eq(dailyLogs.userId, userId), eq(dailyLogs.date, todayDate))
  );
  await db.delete(taskInstances).where(
    and(eq(taskInstances.userId, userId), eq(taskInstances.exerciseDate, todayDate))
  );
  const dayStart = /* @__PURE__ */ new Date(todayDate + "T00:00:00.000Z");
  const dayEnd = /* @__PURE__ */ new Date(todayDate + "T00:00:00.000Z");
  dayEnd.setDate(dayEnd.getDate() + 1);
  const todaysEvents = await db.select().from(progressionEvents).where(
    and(
      eq(progressionEvents.userId, userId),
      gte(progressionEvents.createdAt, dayStart),
      lt(progressionEvents.createdAt, dayEnd)
    )
  );
  const xpToSubtract = todaysEvents.reduce((sum, e) => sum + (e.xpGained ?? 0), 0);
  await db.delete(progressionEvents).where(
    and(
      eq(progressionEvents.userId, userId),
      gte(progressionEvents.createdAt, dayStart),
      lt(progressionEvents.createdAt, dayEnd)
    )
  );
  const state = await getState(userId);
  if (state && state.lastCompletedDate === todayDate) {
    const newTotal = Math.max(0, (state.totalDaysAligned || 0) - 1);
    const newTotalXp = Math.max(0, (state.totalXp ?? 0) - xpToSubtract);
    const newLevel = calculateLevel(newTotalXp);
    const newPhase = getPhaseForLevel(newLevel);
    await db.update(userState).set({
      totalDaysAligned: newTotal,
      lastCompletedTimestamp: null,
      lastCompletedDate: null,
      lastPillar: null,
      totalXp: newTotalXp,
      currentLevel: newLevel,
      currentPhase: newPhase,
      dailyNextsUsed: 0,
      lastNextDate: null
    }).where(eq(userState.userId, userId));
  } else if (state && state.lastNextDate === todayDate) {
    await db.update(userState).set({ dailyNextsUsed: 0, lastNextDate: null }).where(eq(userState.userId, userId));
  }
}
async function resetUserData(userId) {
  await db.delete(dailyLogs).where(eq(dailyLogs.userId, userId));
  await db.delete(exerciseHistory).where(eq(exerciseHistory.userId, userId));
  await db.delete(progressionEvents).where(eq(progressionEvents.userId, userId));
  await db.delete(progressionMilestones).where(eq(progressionMilestones.userId, userId));
  await db.delete(taskInstances).where(eq(taskInstances.userId, userId));
  await db.update(userState).set({
    totalDaysAligned: 0,
    lastCompletedTimestamp: null,
    lastCompletedDate: null,
    lastPillar: null,
    totalXp: 0,
    currentLevel: 0,
    currentPhase: DEFAULT_PHASE,
    dailyNextsUsed: 0,
    lastNextDate: null
  }).where(eq(userState.userId, userId));
}
async function saveFeedback(userId, data) {
  const [entry] = await db.insert(feedback).values({ userId, ...data }).returning();
  return entry;
}
async function getFeedback(userId) {
  return db.select().from(feedback).where(eq(feedback.userId, userId)).orderBy(feedback.createdAt);
}
async function deleteAccount(userId) {
  await db.transaction(async (tx) => {
    await tx.delete(feedback).where(eq(feedback.userId, userId));
    await tx.delete(progressionMilestones).where(eq(progressionMilestones.userId, userId));
    await tx.delete(progressionEvents).where(eq(progressionEvents.userId, userId));
    await tx.delete(taskInstances).where(eq(taskInstances.userId, userId));
    await tx.delete(dailyLogs).where(eq(dailyLogs.userId, userId));
    await tx.delete(exerciseHistory).where(eq(exerciseHistory.userId, userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await tx.delete(userState).where(eq(userState.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}

// server/routes.ts
function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "mindful-trim-jwt-secret";
  return new TextEncoder().encode(secret);
}
async function generateToken(userId) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("90d").sign(getJwtSecret());
}
async function jwtMiddleware(req, _res, next) {
  if (req.session?.userId) {
    req.userId = req.session.userId;
    return next();
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const { payload } = await jwtVerify(token, getJwtSecret());
      if (typeof payload.userId === "string") {
        req.userId = payload.userId;
      }
    } catch {
    }
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}
var authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts, please try again later." },
  skip: () => process.env.NODE_ENV !== "production"
});
var forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1e3,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password reset requests, please try again later." },
  skip: () => process.env.NODE_ENV !== "production"
});
async function registerRoutes(app2) {
  const PgStore = connectPgSimple(session);
  app2.use(
    session({
      store: new PgStore({
        pool,
        createTableIfMissing: true
      }),
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      proxy: process.env.NODE_ENV === "production",
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1e3,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
      }
    })
  );
  app2.use(jwtMiddleware);
  app2.get("/api/config", (_req, res) => {
    res.json({
      appStoreUrl: process.env.APP_STORE_URL || null
    });
  });
  app2.post("/api/auth/register", authRateLimit, async (req, res) => {
    try {
      const { email, password, countryCode, phoneNumber, whatsappOptIn } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Email already registered" });
      }
      if (phoneNumber) {
        const phoneOwner = await getUserByPhone(phoneNumber);
        if (phoneOwner) {
          return res.status(409).json({ message: "This WhatsApp number is already registered to another account.", code: "PHONE_IN_USE" });
        }
      }
      const user = await createUser(email, password);
      req.session.userId = user.id;
      req.userId = user.id;
      if (phoneNumber) {
        await updatePhone(user.id, {
          countryCode: countryCode || null,
          phoneNumber,
          whatsappOptIn: !!whatsappOptIn
        });
      }
      const token = await generateToken(user.id);
      const freshUser = await getUserById(user.id);
      const u = freshUser || user;
      return res.json({
        id: u.id,
        email: u.email,
        identity: u.identity,
        gender: u.gender,
        tonePreference: u.tonePreference,
        compass: u.compass,
        isOnboarded: u.isOnboarded,
        profilePhoto: u.profilePhoto ?? "",
        countryCode: u.countryCode ?? null,
        phoneNumber: u.phoneNumber ?? null,
        whatsappOptIn: u.whatsappOptIn ?? false,
        token
      });
    } catch (err) {
      console.error("Register error:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });
  app2.post("/api/auth/login", authRateLimit, async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }
      const { user, emailNotFound } = await verifyPassword(email, password);
      if (!user) {
        if (emailNotFound) {
          return res.status(404).json({ message: "No account found with that email.", code: "EMAIL_NOT_FOUND" });
        }
        return res.status(401).json({ message: "Incorrect password." });
      }
      req.session.userId = user.id;
      req.userId = user.id;
      const token = await generateToken(user.id);
      return res.json({
        id: user.id,
        email: user.email,
        identity: user.identity,
        gender: user.gender,
        tonePreference: user.tonePreference,
        compass: user.compass,
        isOnboarded: user.isOnboarded,
        profilePhoto: user.profilePhoto ?? "",
        countryCode: user.countryCode ?? null,
        phoneNumber: user.phoneNumber ?? null,
        whatsappOptIn: user.whatsappOptIn ?? false,
        token
      });
    } catch (err) {
      console.error("Login error:", err);
      return res.status(500).json({ message: "Login failed" });
    }
  });
  app2.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      return res.json({ message: "Logged out" });
    });
  });
  app2.get("/api/auth/me", async (req, res) => {
    if (!req.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const user = await getUserById(req.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      const token = await generateToken(user.id);
      return res.json({
        id: user.id,
        email: user.email,
        identity: user.identity,
        gender: user.gender,
        tonePreference: user.tonePreference,
        compass: user.compass,
        isOnboarded: user.isOnboarded,
        profilePhoto: user.profilePhoto ?? "",
        countryCode: user.countryCode ?? null,
        phoneNumber: user.phoneNumber ?? null,
        whatsappOptIn: user.whatsappOptIn ?? false,
        token
      });
    } catch (err) {
      console.error("Get user error:", err);
      return res.status(500).json({ message: "Failed to get user" });
    }
  });
  app2.put("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      if (!email || !newPassword) {
        return res.status(400).json({ message: "Email and new password required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      const updated = await updatePassword(email.toLowerCase(), newPassword);
      if (!updated) {
        return res.status(404).json({ message: "No account found with that email" });
      }
      return res.json({ message: "Password updated successfully" });
    } catch (err) {
      console.error("Reset password error:", err);
      return res.status(500).json({ message: "Failed to reset password" });
    }
  });
  app2.get("/api/auth/verify-reset-token/:token", async (req, res) => {
    try {
      const token = req.params.token;
      if (!token) return res.json({ valid: false });
      const result = await verifyResetToken(token);
      return res.json({ valid: result.valid });
    } catch (err) {
      console.error("Verify reset token error:", err);
      return res.json({ valid: false });
    }
  });
  app2.get("/api/auth/security-question/:email", forgotPasswordRateLimit, async (req, res) => {
    try {
      const emailParam = req.params.email;
      const email = Array.isArray(emailParam) ? emailParam[0] : emailParam;
      if (!email) return res.status(400).json({ message: "Email required" });
      const question = await getSecurityQuestionByEmail(email.toLowerCase());
      if (!question) {
        return res.status(404).json({ message: "No account found with that email, or no security question set." });
      }
      return res.json({ question });
    } catch (err) {
      console.error("Get security question error:", err);
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });
  app2.post("/api/auth/verify-security-answer", forgotPasswordRateLimit, async (req, res) => {
    try {
      const { email, answer } = req.body;
      if (!email || !answer) return res.status(400).json({ message: "Email and answer required" });
      const result = await verifySecurityAnswer(email.toLowerCase(), answer);
      if (!result) {
        return res.status(400).json({ message: "Incorrect answer. Please try again." });
      }
      const { token, rateLimited } = await createResetToken(result.userId);
      if (rateLimited) {
        return res.status(429).json({ message: "Please wait a moment before trying again." });
      }
      return res.json({ success: true, resetToken: token });
    } catch (err) {
      console.error("Verify security answer error:", err);
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });
  const ALLOWED_SECURITY_QUESTIONS = [
    "What was the name of your first pet?",
    "What is your mother's maiden name?",
    "What was the name of your first school?",
    "What city were you born in?",
    "What was your childhood nickname?",
    "What is the name of the street you grew up on?"
  ];
  app2.put("/api/auth/security-question", requireAuth, async (req, res) => {
    try {
      const { question, answer } = req.body;
      if (!question || !answer) return res.status(400).json({ message: "Question and answer required" });
      if (!ALLOWED_SECURITY_QUESTIONS.includes(question)) {
        return res.status(400).json({ message: "Invalid security question. Please choose from the provided list." });
      }
      if (answer.trim().length < 2) return res.status(400).json({ message: "Answer is too short" });
      await setSecurityQuestion(req.userId, question, answer);
      return res.json({ success: true });
    } catch (err) {
      console.error("Set security question error:", err);
      return res.status(500).json({ message: "Failed to save security question" });
    }
  });
  app2.get("/api/auth/has-security-question", requireAuth, async (req, res) => {
    try {
      const user = await getUserById(req.userId);
      return res.json({ hasSecurityQuestion: !!user?.securityQuestion });
    } catch (err) {
      console.error("Has security question error:", err);
      return res.status(500).json({ message: "Failed to check security question" });
    }
  });
  app2.get("/api/auth/my-security-question", requireAuth, async (req, res) => {
    try {
      const user = await getUserById(req.userId);
      if (!user || !user.securityQuestion) {
        return res.json({ question: null });
      }
      return res.json({ question: user.securityQuestion });
    } catch (err) {
      console.error("My security question error:", err);
      return res.status(500).json({ message: "Failed to fetch security question" });
    }
  });
  app2.post("/api/auth/confirm-reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token and new password are required." });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }
      const result = await consumeResetToken(token.trim(), newPassword);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid or expired link. Please request a new one." });
      }
      return res.json({ message: "Password updated successfully." });
    } catch (err) {
      console.error("Confirm reset error:", err);
      return res.status(500).json({ message: "Failed to reset password." });
    }
  });
  app2.put("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      const result = await changePassword(req.userId, currentPassword, newPassword);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      return res.json({ message: result.message });
    } catch (err) {
      console.error("Change password error:", err);
      return res.status(500).json({ message: "Failed to change password" });
    }
  });
  app2.put("/api/auth/onboarding", requireAuth, async (req, res) => {
    try {
      const { identity, gender } = req.body;
      const user = await completeOnboarding(req.userId, {
        identity,
        gender,
        tonePreference: "Motivating",
        compass: ""
      });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json({
        id: user.id,
        email: user.email,
        identity: user.identity,
        gender: user.gender,
        tonePreference: user.tonePreference,
        compass: user.compass,
        isOnboarded: user.isOnboarded,
        profilePhoto: user.profilePhoto ?? ""
      });
    } catch (err) {
      console.error("Onboarding error:", err);
      return res.status(500).json({ message: "Onboarding failed" });
    }
  });
  app2.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const { identity, gender, tonePreference, compass, profilePhoto } = req.body;
      const result = await updateProfile(req.userId, {
        identity,
        gender,
        tonePreference,
        compass,
        profilePhoto
      });
      if (result.error) {
        return res.status(409).json({ message: result.error });
      }
      const user = result.user;
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json({
        id: user.id,
        email: user.email,
        identity: user.identity,
        gender: user.gender,
        tonePreference: user.tonePreference,
        compass: user.compass,
        isOnboarded: user.isOnboarded,
        profilePhoto: user.profilePhoto ?? ""
      });
    } catch (err) {
      console.error("Update profile error:", err);
      return res.status(500).json({ message: "Failed to update profile" });
    }
  });
  app2.put("/api/auth/phone", requireAuth, async (req, res) => {
    try {
      const { countryCode, phoneNumber, whatsappOptIn } = req.body;
      const result = await updatePhone(req.userId, {
        countryCode: phoneNumber ? countryCode || null : null,
        phoneNumber: phoneNumber || null,
        whatsappOptIn: phoneNumber ? !!whatsappOptIn : false
      });
      if (result.error) return res.status(409).json({ message: result.error });
      const user = result.user;
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.json({
        id: user.id,
        email: user.email,
        identity: user.identity,
        gender: user.gender,
        tonePreference: user.tonePreference,
        compass: user.compass,
        isOnboarded: user.isOnboarded,
        profilePhoto: user.profilePhoto ?? "",
        countryCode: user.countryCode ?? null,
        phoneNumber: user.phoneNumber ?? null,
        whatsappOptIn: user.whatsappOptIn ?? false
      });
    } catch (err) {
      console.error("Update phone error:", err);
      return res.status(500).json({ message: "Failed to update phone" });
    }
  });
  app2.get("/api/state", requireAuth, async (req, res) => {
    try {
      const state = await getState(req.userId);
      const nextStatus = await getNextStatus(req.userId);
      return res.json(state ? { ...state, ...nextStatus } : {
        totalDaysAligned: 0,
        lastCompletedTimestamp: null,
        lastCompletedDate: null,
        lastPillar: null,
        totalXp: 0,
        currentLevel: 0,
        currentPhase: "The Arriving",
        ...nextStatus
      });
    } catch (err) {
      console.error("Get state error:", err);
      return res.status(500).json({ message: "Failed to get state" });
    }
  });
  app2.post("/api/complete", requireAuth, async (req, res) => {
    try {
      const {
        totalDaysAligned,
        lastCompletedTimestamp,
        lastCompletedDate,
        lastPillar,
        exerciseId,
        exerciseName,
        exerciseDifficulty,
        pillar,
        moodBefore,
        contextTags
      } = req.body;
      if (!exerciseId || !lastCompletedDate) {
        return res.status(400).json({ message: "exerciseId and lastCompletedDate required" });
      }
      const { xpToAward, isRetry, mode } = await markTaskCompletedSafely(
        req.userId,
        exerciseId,
        lastCompletedDate,
        exerciseDifficulty || "easy"
      );
      const trueTotalDaysAligned = mode === "alignment" ? await countAlignedDays(req.userId) : void 0;
      const logData = {
        date: lastCompletedDate,
        pillar: pillar || lastPillar || "Mental",
        exerciseId,
        exerciseName: exerciseName || "",
        difficulty: exerciseDifficulty || "easy",
        moodBefore: moodBefore ?? 3,
        contextTags: contextTags || [],
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        mode
      };
      const stateUpdate = mode === "alignment" ? { totalDaysAligned: trueTotalDaysAligned, lastCompletedTimestamp, lastCompletedDate, lastPillar } : { lastPillar };
      const [savedLog, stateResult] = await Promise.all([
        addLog(req.userId, logData),
        updateState(
          req.userId,
          stateUpdate,
          xpToAward > 0 ? xpToAward : void 0
        )
      ]);
      return res.json({
        log: savedLog,
        state: stateResult.state,
        progression: stateResult.progression,
        xpAwarded: xpToAward,
        isRetry,
        mode
      });
    } catch (err) {
      console.error("Complete error:", err);
      return res.status(500).json({ message: "Failed to complete exercise" });
    }
  });
  app2.get("/api/activity/last-3-days", requireAuth, async (req, res) => {
    try {
      const activity = await getLast3DaysActivity(req.userId);
      return res.json(activity);
    } catch (err) {
      console.error("Activity error:", err);
      return res.status(500).json({ message: "Failed to get activity" });
    }
  });
  app2.put("/api/state", requireAuth, async (req, res) => {
    try {
      const { xpToAdd, exerciseDifficulty, ...stateData } = req.body;
      let finalXp;
      if (exerciseDifficulty) {
        const state2 = await getState(req.userId);
        const currentLevel = state2?.currentLevel ?? 0;
        const base = getBaseXpByDifficulty(exerciseDifficulty);
        finalXp = calculateScaledXp(base, currentLevel);
      } else if (xpToAdd) {
        finalXp = xpToAdd;
      }
      const { state, progression } = await updateState(
        req.userId,
        stateData,
        finalXp
      );
      return res.json({ state, progression });
    } catch (err) {
      console.error("Update state error:", err);
      return res.status(500).json({ message: "Failed to update state" });
    }
  });
  app2.get("/api/exercise/next-status", requireAuth, async (req, res) => {
    try {
      const status = await getNextStatus(req.userId);
      return res.json(status);
    } catch (err) {
      console.error("Next status error:", err);
      return res.status(500).json({ message: "Failed to get next status" });
    }
  });
  app2.post("/api/exercise/next", requireAuth, async (req, res) => {
    try {
      const result = await recordNext(req.userId);
      if (!result.wasRecorded) {
        return res.status(429).json({
          message: `Daily limit of ${DAILY_NEXT_LIMIT} skips reached`,
          ...result
        });
      }
      return res.json(result);
    } catch (err) {
      console.error("Next exercise error:", err);
      return res.status(500).json({ message: "Failed to record next" });
    }
  });
  app2.get("/api/progression/status", requireAuth, async (req, res) => {
    try {
      const status = await getProgressionStatus(req.userId);
      return res.json(status || {
        totalXp: 0,
        currentLevel: 0,
        currentPhase: "The Arriving",
        currentPhaseName: "The Arriving",
        currentPhaseLevelRange: "Levels 1\u201310",
        xpForNextLevel: 150,
        currentLevelProgressPercent: 0,
        yearProgressPercent: 0,
        completedDaysCount: 0,
        isMaxLevel: false,
        isPrestige: false,
        nextMilestone: "phase_arriving_complete",
        latestUnlockedMilestone: null
      });
    } catch (err) {
      console.error("Progression status error:", err);
      return res.status(500).json({ message: "Failed to get progression status" });
    }
  });
  app2.get("/api/progression/milestones", requireAuth, async (req, res) => {
    try {
      const milestones = await getMilestones(req.userId);
      return res.json(milestones);
    } catch (err) {
      console.error("Get milestones error:", err);
      return res.status(500).json({ message: "Failed to get milestones" });
    }
  });
  app2.get("/api/logs", requireAuth, async (req, res) => {
    try {
      const logs = await getLogs(req.userId);
      return res.json(logs);
    } catch (err) {
      console.error("Get logs error:", err);
      return res.status(500).json({ message: "Failed to get logs" });
    }
  });
  app2.post("/api/logs", requireAuth, async (req, res) => {
    try {
      const log2 = await addLog(req.userId, req.body);
      return res.json(log2);
    } catch (err) {
      console.error("Add log error:", err);
      return res.status(500).json({ message: "Failed to add log" });
    }
  });
  app2.get("/api/history", requireAuth, async (req, res) => {
    try {
      const history = await getHistory(req.userId);
      return res.json(history);
    } catch (err) {
      console.error("Get history error:", err);
      return res.status(500).json({ message: "Failed to get history" });
    }
  });
  app2.put("/api/history", requireAuth, async (req, res) => {
    try {
      const { pillar, usedExerciseIds } = req.body;
      await updateHistory(req.userId, pillar, usedExerciseIds);
      return res.json({ success: true });
    } catch (err) {
      console.error("Update history error:", err);
      return res.status(500).json({ message: "Failed to update history" });
    }
  });
  app2.post("/api/reset-today", requireAuth, async (req, res) => {
    try {
      const { todayDate } = req.body;
      if (!todayDate) {
        return res.status(400).json({ message: "todayDate required" });
      }
      await resetTodayData(req.userId, todayDate);
      return res.json({ message: "Today reset successfully" });
    } catch (err) {
      console.error("Reset today error:", err);
      return res.status(500).json({ message: "Failed to reset today" });
    }
  });
  app2.post("/api/reset", requireAuth, async (req, res) => {
    try {
      await resetUserData(req.userId);
      return res.json({ success: true });
    } catch (err) {
      console.error("Reset error:", err);
      return res.status(500).json({ message: "Failed to reset data" });
    }
  });
  app2.post("/api/feedback", requireAuth, async (req, res) => {
    try {
      const { rating, category, message } = req.body;
      if (!rating || !category || !message) {
        return res.status(400).json({ message: "rating, category, and message are required" });
      }
      if (typeof rating !== "number" || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "rating must be between 1 and 5" });
      }
      if (!message.trim()) {
        return res.status(400).json({ message: "message cannot be empty" });
      }
      const entry = await saveFeedback(req.userId, {
        rating,
        category,
        message: message.trim()
      });
      console.info("[Feedback] userId=%s rating=%s category=%s", req.userId, rating, category);
      return res.json(entry);
    } catch (err) {
      console.error("Feedback error:", err);
      return res.status(500).json({ message: "Failed to save feedback" });
    }
  });
  app2.get("/api/feedback", requireAuth, async (req, res) => {
    try {
      const entries = await getFeedback(req.userId);
      return res.json(entries);
    } catch (err) {
      console.error("Get feedback error:", err);
      return res.status(500).json({ message: "Failed to get feedback" });
    }
  });
  app2.delete("/api/account", requireAuth, async (req, res) => {
    try {
      const userId = req.userId;
      await deleteAccount(userId);
      req.session.destroy(() => {
      });
      console.info(`[Account] Deleted account for userId=${userId}`);
      return res.json({ message: "Account deleted" });
    } catch (err) {
      console.error("Delete account error:", err);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });
  const templatesDir = path.resolve(process.cwd(), "server", "templates");
  app2.get("/privacy", (_req, res) => {
    try {
      const html = fs.readFileSync(path.join(templatesDir, "privacy.html"), "utf-8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err) {
      console.error("Privacy page error:", err);
      return res.status(500).send("Privacy Policy unavailable");
    }
  });
  app2.get("/terms", (_req, res) => {
    try {
      const html = fs.readFileSync(path.join(templatesDir, "terms.html"), "utf-8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(html);
    } catch (err) {
      console.error("Terms page error:", err);
      return res.status(500).send("Terms of Service unavailable");
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
import * as fs2 from "fs";
import * as path2 from "path";
var app = express();
var log = console.log;
app.set("trust proxy", 1);
function setupCors(app2) {
  app2.use((req, res, next) => {
    const origins = /* @__PURE__ */ new Set();
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
    if (process.env.REPLIT_DOMAINS) {
      process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
        origins.add(`https://${d.trim()}`);
      });
    }
    const origin = req.header("origin");
    const isLocalhost = process.env.NODE_ENV !== "production" && (origin?.startsWith("http://localhost:") || origin?.startsWith("http://127.0.0.1:"));
    if (origin && (origins.has(origin) || isLocalhost)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");
    }
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });
}
function setupBodyParsing(app2) {
  app2.use(
    express.json({
      limit: "5mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app2.use(express.urlencoded({ extended: false }));
}
function setupRequestLogging(app2) {
  const isDev = process.env.NODE_ENV !== "production";
  app2.use((req, res, next) => {
    const start = Date.now();
    const path3 = req.path;
    let capturedJsonResponse = void 0;
    if (isDev) {
      const originalResJson = res.json;
      res.json = function(bodyJson, ...args) {
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
      };
    }
    res.on("finish", () => {
      if (!path3.startsWith("/api")) return;
      const duration = Date.now() - start;
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (isDev && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "\u2026";
        }
      }
      log(logLine);
    });
    next();
  });
}
function getAppName() {
  try {
    const appJsonPath = path2.resolve(process.cwd(), "app.json");
    const appJsonContent = fs2.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}
var ALLOWED_PLATFORMS = /* @__PURE__ */ new Set(["ios", "android"]);
function serveExpoManifest(platform, res) {
  if (!ALLOWED_PLATFORMS.has(platform)) {
    return res.status(400).json({ error: "Invalid platform" });
  }
  const safePlatform = platform === "ios" ? "ios" : "android";
  const manifestPath = path2.resolve(
    process.cwd(),
    "static-build",
    safePlatform,
    "manifest.json"
  );
  if (!fs2.existsSync(manifestPath)) {
    return res.status(404).json({ error: `Manifest not found for platform: ${platform}` });
  }
  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  const manifest = fs2.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}
function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;
  const html = landingPageTemplate.replace(/BASE_URL_PLACEHOLDER/g, baseUrl).replace(/EXPS_URL_PLACEHOLDER/g, expsUrl).replace(/APP_NAME_PLACEHOLDER/g, appName);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}
function configureExpoAndLanding(app2) {
  const templatePath = path2.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html"
  );
  const landingPageTemplate = fs2.readFileSync(templatePath, "utf-8");
  const appName = getAppName();
  log("Serving static Expo files with dynamic manifest routing");
  const resetPagePath = path2.resolve(process.cwd(), "server", "templates", "reset-password.html");
  app2.get("/reset-password", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(fs2.readFileSync(resetPagePath, "utf-8"));
  });
  app2.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }
    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }
    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName
      });
    }
    next();
  });
  app2.use("/assets", express.static(path2.resolve(process.cwd(), "assets")));
  app2.use(express.static(path2.resolve(process.cwd(), "static-build")));
  log("Expo routing: Checking expo-platform header on / and /manifest");
}
function setupErrorHandler(app2) {
  app2.use((err, _req, res, next) => {
    const error = err;
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });
}
(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);
  configureExpoAndLanding(app);
  const server = await registerRoutes(app);
  setupErrorHandler(app);
  backfillProgressionForAllUsers().catch(
    (err) => console.error("Progression backfill failed:", err)
  );
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true
    },
    () => {
      log(`express server serving on port ${port}`);
    }
  );
})();
