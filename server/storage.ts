import { eq, and, or, ne, gte, lt, sql } from "drizzle-orm";
import crypto from "crypto";
import { db, pool } from "./db";
import {
  users,
  userState,
  exerciseHistory,
  dailyLogs,
  taskInstances,
  passwordResetTokens,
  otpCodes,
  progressionEvents,
  progressionMilestones,
  feedback,
  trustedDevices,
  userHabits,
  habitLogs,
  dailyFuelLogs,
  friendships,
  inviteLinks,
  type User,
  type UserState,
  type DailyLog,
  type TaskInstance,
  type ProgressionMilestone,
} from "@shared/schema";
import bcrypt from "bcryptjs";
import {
  calculateLevel,
  getPhaseForLevel,
  getPhaseRange,
  nextLevelXpRequired,
  levelProgressPercent,
  yearProgressPercent,
  getMilestoneAtLevel,
  getNextMilestone,
  getBaseXpByDifficulty,
  calculateScaledXp,
  MAX_LEVEL,
  DAILY_NEXT_LIMIT,
} from "./progressionEngine";

const DEFAULT_PHASE = 'The Arriving';

type UserInsert = typeof users.$inferInsert;

const TAG_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateTag(): string {
  let tag = '';
  for (let i = 0; i < 4; i++) {
    tag += TAG_CHARS[Math.floor(Math.random() * TAG_CHARS.length)];
  }
  return tag;
}

export async function createUser(
  email: string,
  password: string,
): Promise<User> {
  const passwordHash = await bcrypt.hash(password, 12);
  let uniqueTag = generateTag();
  let attempts = 0;
  while (attempts < 20) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.uniqueTag, uniqueTag));
    if (existing.length === 0) break;
    uniqueTag = generateTag();
    attempts++;
  }
  const insertValues: UserInsert = { email, passwordHash, uniqueTag };
  const [user] = await db.insert(users).values(insertValues).returning();
  await db.insert(userState).values({ userId: user.id });
  return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function getUserByPhone(phoneNumber: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
  return user;
}

export async function getUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function verifyPassword(email: string, password: string): Promise<{ user: User | null; emailNotFound: boolean }> {
  const user = await getUserByEmail(email);
  if (!user) return { user: null, emailNotFound: true };
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return { user: null, emailNotFound: false };
  return { user, emailNotFound: false };
}

export async function completeOnboarding(
  userId: string,
  data: { identity: string; gender: string; tonePreference: string; compass: string }
): Promise<User | null> {
  const [updated] = await db
    .update(users)
    .set({
      identity: data.identity,
      gender: data.gender,
      tonePreference: data.tonePreference,
      compass: data.compass,
      isOnboarded: true,
    })
    .where(eq(users.id, userId))
    .returning();
  return updated || null;
}

export async function updatePassword(email: string, newPassword: string): Promise<boolean> {
  const user = await getUserByEmail(email);
  if (!user) return false;
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  return true;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const user = await getUserById(userId);
  if (!user) return { success: false, message: 'User not found' };
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) return { success: false, message: 'Current password is incorrect' };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  return { success: true, message: 'Password updated successfully' };
}

export async function setSecurityQuestion(
  userId: string,
  question: string,
  answer: string
): Promise<void> {
  const securityAnswerHash = await bcrypt.hash(answer.trim().toLowerCase(), 10);
  await db.update(users)
    .set({ securityQuestion: question, securityAnswerHash })
    .where(eq(users.id, userId));
}

export async function getSecurityQuestionByEmail(email: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  if (!user || !user.securityQuestion) return null;
  return user.securityQuestion;
}

export async function verifySecurityAnswer(
  email: string,
  answer: string
): Promise<{ userId: string } | null> {
  const user = await getUserByEmail(email);
  if (!user || !user.securityAnswerHash) return null;
  const match = await bcrypt.compare(answer.trim().toLowerCase(), user.securityAnswerHash);
  if (!match) return null;
  return { userId: user.id };
}


type UserUpdate = Partial<typeof users.$inferInsert>;

export async function updateProfile(
  userId: string,
  data: {
    identity?: string;
    gender?: string;
    tonePreference?: string;
    compass?: string;
    profilePhoto?: string;
    language?: string;
  }
): Promise<{ user: User | null; error?: string }> {
  const updateData: UserUpdate = {};
  if (data.identity !== undefined) updateData.identity = data.identity;
  if (data.gender !== undefined) updateData.gender = data.gender;
  if (data.tonePreference !== undefined) updateData.tonePreference = data.tonePreference;
  if (data.compass !== undefined) updateData.compass = data.compass;
  if (data.profilePhoto !== undefined) updateData.profilePhoto = data.profilePhoto;
  if (data.language !== undefined) updateData.language = data.language;

  if (Object.keys(updateData).length === 0) return { user: (await getUserById(userId)) ?? null };
  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();
  return { user: updated || null };
}

export async function updatePhone(
  userId: string,
  data: { countryCode: string | null; phoneNumber: string | null; whatsappOptIn: boolean }
): Promise<{ user: User | null; error?: string }> {
  if (data.phoneNumber) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phoneNumber, data.phoneNumber), ne(users.id, userId)));
    if (existing) {
      return { user: null, error: 'This WhatsApp number is already registered to another account.' };
    }
  }
  const updateData: UserUpdate = {
    countryCode: data.countryCode,
    phoneNumber: data.phoneNumber,
    whatsappOptIn: data.whatsappOptIn,
  };
  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning();
  return { user: updated || null };
}

const TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const TOKEN_RATE_LIMIT_MS = 60 * 1000;

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createResetToken(userId: string): Promise<{ token: string; rateLimited: boolean }> {
  const [existing] = await db.select().from(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId));
  if (existing && !existing.used && existing.createdAt &&
      Date.now() - existing.createdAt.getTime() < TOKEN_RATE_LIMIT_MS) {
    return { token: '', rateLimited: true };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(rawToken);

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({
    userId, token: hashedToken,
    expiresAt: sql`NOW() + interval '1 hour'`,
    attempts: 0
  });
  return { token: rawToken, rateLimited: false };
}

export async function verifyResetToken(rawToken: string): Promise<{ valid: boolean; userId?: string }> {
  const hashedToken = hashToken(rawToken);
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, hashedToken));
  if (!row || row.used) return { valid: false };
  return { valid: true, userId: row.userId };
}

export async function consumeResetToken(rawToken: string, newPassword: string): Promise<{ success: boolean }> {
  const hashedToken = hashToken(rawToken);
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, hashedToken));
  if (!row || row.used) return { success: false };
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, hashedToken));
  return { success: true };
}

export async function getState(userId: string): Promise<UserState | null> {
  const [state] = await db.select().from(userState).where(eq(userState.userId, userId));
  return state || null;
}

export type ProgressionResult = {
  xpGained: number;
  totalXp: number;
  levelBefore: number;
  currentLevel: number;
  levelUp: boolean;
  phaseBefore: string;
  currentPhase: string;
  currentPhaseLevelRange: string;
  phaseTransition: boolean;
  isMaxLevel: boolean;
  isPrestige: boolean;
  newMilestoneKey: string | null;
  nextLevelXpRequired: number;
  currentLevelProgressPercent: number;
  yearProgressPercent: number;
} | null;

// ─── Backend-only XP calculation with Retry protection ────────────────────────
/**
 * Counts the true number of aligned days from task_instances.
 * This is authoritative — it never drifts from the real activity data,
 * even if the client sent wrong values in the past.
 */
export async function countAlignedDays(userId: string): Promise<number> {
  const result = await db.execute(
    sql`SELECT COUNT(DISTINCT exercise_date)::int AS cnt
        FROM task_instances
        WHERE user_id = ${userId}
          AND xp_awarded = true
          AND is_retry = false`
  );
  return (result.rows[0]?.cnt as number) ?? 0;
}

export async function markTaskCompletedSafely(
  userId: string,
  exerciseId: string,
  exerciseDate: string,
  difficulty: string
): Promise<{ xpToAward: number; isRetry: boolean; mode: 'alignment' | 'practice' }> {
  const existingInstances = await db
    .select()
    .from(taskInstances)
    .where(
      and(
        eq(taskInstances.userId, userId),
        eq(taskInstances.exerciseDate, exerciseDate)
      )
    );

  const alreadyAwarded = existingInstances.some(i => i.xpAwarded === true);
  const isRetry = alreadyAwarded;
  const mode: 'alignment' | 'practice' = isRetry ? 'practice' : 'alignment';

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
    isRetry,
  });

  return { xpToAward, isRetry, mode };
}

export async function updateState(
  userId: string,
  data: Partial<{
    totalDaysAligned: number;
    lastCompletedTimestamp: string;
    lastCompletedDate: string;
    lastPillar: string;
  }>,
  xpToAdd?: number
): Promise<{ state: UserState | null; progression: ProgressionResult }> {
  const existing = await getState(userId);
  let progression: ProgressionResult = null;

  let progressionFields: Partial<{ totalXp: number; currentLevel: number; currentPhase: string }> = {};

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
      phaseAfter: newPhase,
    });

    let newMilestoneKey: string | null = null;
    if (levelUp) {
      for (let lv = levelBefore + 1; lv <= newLevel; lv++) {
        const key = getMilestoneAtLevel(lv);
        if (key) {
          const existingMilestone = await db
            .select()
            .from(progressionMilestones)
            .where(and(eq(progressionMilestones.userId, userId), eq(progressionMilestones.milestoneKey, key)));
          if (existingMilestone.length === 0) {
            await db.insert(progressionMilestones).values({
              userId,
              milestoneKey: key,
              levelReached: lv,
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
      yearProgressPercent: yearProgressPercent(newTotalXp),
    };
  }

  const updateData = { ...data, ...progressionFields };

  if (!existing) {
    const [created] = await db.insert(userState).values({ userId, ...updateData }).returning();
    return { state: created, progression };
  }
  const [updated] = await db
    .update(userState)
    .set(updateData)
    .where(eq(userState.userId, userId))
    .returning();
  return { state: updated || null, progression };
}

// ─── Next/Skip mechanic ────────────────────────────────────────────────────────
export async function getNextStatus(userId: string): Promise<{ nextsUsed: number; nextsLimit: number; canNext: boolean }> {
  const state = await getState(userId);
  const today = new Date().toISOString().slice(0, 10);
  const lastNextDate = state?.lastNextDate;
  const nextsUsed = lastNextDate === today ? (state?.dailyNextsUsed ?? 0) : 0;
  return {
    nextsUsed,
    nextsLimit: DAILY_NEXT_LIMIT,
    canNext: nextsUsed < DAILY_NEXT_LIMIT,
  };
}

export async function recordNext(userId: string): Promise<{ nextsUsed: number; nextsLimit: number; canNext: boolean; wasRecorded: boolean }> {
  const state = await getState(userId);
  const today = new Date().toISOString().slice(0, 10);
  const lastNextDate = state?.lastNextDate;
  const currentNextsUsed = lastNextDate === today ? (state?.dailyNextsUsed ?? 0) : 0;

  if (currentNextsUsed >= DAILY_NEXT_LIMIT) {
    return { nextsUsed: currentNextsUsed, nextsLimit: DAILY_NEXT_LIMIT, canNext: false, wasRecorded: false };
  }

  const newNextsUsed = currentNextsUsed + 1;
  if (!state) {
    await db.insert(userState).values({ userId, dailyNextsUsed: newNextsUsed, lastNextDate: today });
  } else {
    await db.update(userState)
      .set({ dailyNextsUsed: newNextsUsed, lastNextDate: today })
      .where(eq(userState.userId, userId));
  }

  return {
    nextsUsed: newNextsUsed,
    nextsLimit: DAILY_NEXT_LIMIT,
    canNext: newNextsUsed < DAILY_NEXT_LIMIT,
    wasRecorded: true,
  };
}

export async function backfillProgressionForAllUsers(): Promise<void> {
  const allStates = await db.select().from(userState);
  for (const state of allStates) {
    const xp = state.totalXp ?? 0;
    const correctLevel = calculateLevel(xp);
    const correctPhase = getPhaseForLevel(correctLevel);
    const needsUpdate =
      (state.currentLevel ?? 0) !== correctLevel ||
      (state.currentPhase ?? DEFAULT_PHASE) !== correctPhase;
    if (needsUpdate) {
      await db
        .update(userState)
        .set({ currentLevel: correctLevel, currentPhase: correctPhase })
        .where(eq(userState.userId, state.userId));
    }
  }
}

export async function getProgressionStatus(userId: string) {
  const state = await getState(userId);
  if (!state) return null;
  const totalXp = state.totalXp ?? 0;
  const currentLevel = state.currentLevel ?? calculateLevel(totalXp);
  const currentPhase = state.currentPhase ?? DEFAULT_PHASE;
  const currentPhaseLevelRange = getPhaseRange(currentLevel);
  const nextMilestone = getNextMilestone(currentLevel);

  const milestones = await getMilestones(userId);
  const latestUnlockedMilestone = milestones.length > 0
    ? milestones[milestones.length - 1].milestoneKey
    : null;

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
    latestUnlockedMilestone,
  };
}

export async function getMilestones(userId: string): Promise<ProgressionMilestone[]> {
  return db
    .select()
    .from(progressionMilestones)
    .where(eq(progressionMilestones.userId, userId))
    .orderBy(progressionMilestones.triggeredAt);
}

export async function getLogs(userId: string): Promise<DailyLog[]> {
  return db.select().from(dailyLogs).where(eq(dailyLogs.userId, userId));
}

export async function addLog(
  userId: string,
  log: {
    date: string;
    pillar: string;
    exerciseId: string;
    exerciseName: string;
    difficulty?: string;
    moodBefore: number;
    contextTags: string[];
    completedAt: string;
    mode?: string;
  }
): Promise<DailyLog> {
  const [created] = await db
    .insert(dailyLogs)
    .values({ userId, ...log })
    .returning();
  return created;
}

export async function getLast3DaysActivity(
  userId: string
): Promise<Array<{ date: string; alignment: number; practice: number }>> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }

  const rows = await db
    .select()
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.userId, userId),
        gte(dailyLogs.date, dates[0])
      )
    );

  return dates.map(date => {
    const dayRows = rows.filter(r => r.date === date);
    const alignment = dayRows.filter(r => !r.mode || r.mode === 'alignment').length;
    const practice = dayRows.filter(r => r.mode === 'practice').length;
    return { date, alignment, practice };
  });
}

export async function getHistory(userId: string): Promise<Record<string, string[]>> {
  const rows = await db
    .select()
    .from(exerciseHistory)
    .where(eq(exerciseHistory.userId, userId));
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    result[row.pillar] = (row.usedExerciseIds as string[]) || [];
  }
  return result;
}

export async function updateHistory(
  userId: string,
  pillar: string,
  usedExerciseIds: string[]
): Promise<void> {
  const [existing] = await db
    .select()
    .from(exerciseHistory)
    .where(and(eq(exerciseHistory.userId, userId), eq(exerciseHistory.pillar, pillar)));

  if (existing) {
    await db
      .update(exerciseHistory)
      .set({ usedExerciseIds })
      .where(eq(exerciseHistory.id, existing.id));
  } else {
    await db.insert(exerciseHistory).values({ userId, pillar, usedExerciseIds });
  }
}

export async function resetTodayData(userId: string, todayDate: string): Promise<void> {
  await db.delete(dailyLogs).where(
    and(eq(dailyLogs.userId, userId), eq(dailyLogs.date, todayDate))
  );

  await db.delete(taskInstances).where(
    and(eq(taskInstances.userId, userId), eq(taskInstances.exerciseDate, todayDate))
  );

  // Sum XP from today's progression events (UTC day boundary)
  const dayStart = new Date(todayDate + 'T00:00:00.000Z');
  const dayEnd = new Date(todayDate + 'T00:00:00.000Z');
  dayEnd.setDate(dayEnd.getDate() + 1);

  const todaysEvents = await db
    .select()
    .from(progressionEvents)
    .where(
      and(
        eq(progressionEvents.userId, userId),
        gte(progressionEvents.createdAt, dayStart),
        lt(progressionEvents.createdAt, dayEnd)
      )
    );

  const xpToSubtract = todaysEvents.reduce((sum, e) => sum + (e.xpGained ?? 0), 0);

  // Delete today's progression events
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

    await db
      .update(userState)
      .set({
        totalDaysAligned: newTotal,
        lastCompletedTimestamp: null,
        lastCompletedDate: null,
        lastPillar: null,
        totalXp: newTotalXp,
        currentLevel: newLevel,
        currentPhase: newPhase,
        dailyNextsUsed: 0,
        lastNextDate: null,
      })
      .where(eq(userState.userId, userId));
  } else if (state && state.lastNextDate === todayDate) {
    await db
      .update(userState)
      .set({ dailyNextsUsed: 0, lastNextDate: null })
      .where(eq(userState.userId, userId));
  }
}

export async function resetUserData(userId: string): Promise<void> {
  await db.delete(dailyLogs).where(eq(dailyLogs.userId, userId));
  await db.delete(exerciseHistory).where(eq(exerciseHistory.userId, userId));
  await db.delete(progressionEvents).where(eq(progressionEvents.userId, userId));
  await db.delete(progressionMilestones).where(eq(progressionMilestones.userId, userId));
  await db.delete(taskInstances).where(eq(taskInstances.userId, userId));
  await db
    .update(userState)
    .set({
      totalDaysAligned: 0,
      lastCompletedTimestamp: null,
      lastCompletedDate: null,
      lastPillar: null,
      totalXp: 0,
      currentLevel: 0,
      currentPhase: DEFAULT_PHASE,
      dailyNextsUsed: 0,
      lastNextDate: null,
    })
    .where(eq(userState.userId, userId));
}

export async function saveFeedback(
  userId: string,
  data: { rating: number; category: string; message: string }
) {
  const [entry] = await db
    .insert(feedback)
    .values({ userId, ...data })
    .returning();
  return entry;
}

export async function getFeedback(userId: string) {
  return db
    .select()
    .from(feedback)
    .where(eq(feedback.userId, userId))
    .orderBy(feedback.createdAt);
}

export async function deleteAccount(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(feedback).where(eq(feedback.userId, userId));
    await tx.delete(progressionMilestones).where(eq(progressionMilestones.userId, userId));
    await tx.delete(progressionEvents).where(eq(progressionEvents.userId, userId));
    await tx.delete(taskInstances).where(eq(taskInstances.userId, userId));
    await tx.delete(dailyLogs).where(eq(dailyLogs.userId, userId));
    await tx.delete(exerciseHistory).where(eq(exerciseHistory.userId, userId));
    await tx.delete(otpCodes).where(eq(otpCodes.userId, userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await tx.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
    await tx.delete(habitLogs).where(eq(habitLogs.userId, userId));
    await tx.delete(userHabits).where(eq(userHabits.userId, userId));
    await tx.delete(dailyFuelLogs).where(eq(dailyFuelLogs.userId, userId));
    await tx.delete(friendships).where(
      or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))
    );
    await tx.delete(userState).where(eq(userState.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}

// ── Two-Factor Authentication ────────────────────────────────────────────────

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

const OTP_RESEND_COOLDOWN_SECONDS = 60;

export async function createPasswordResetOtp(email: string): Promise<{ code: string; notFound: boolean; rateLimited?: boolean; retryAfter?: number }> {
  const user = await getUserByEmail(email);
  if (!user) return { code: '', notFound: true };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock any existing password-reset OTP row for this user to prevent
    // concurrent requests from both passing the cooldown check simultaneously.
    const { rows } = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM otp_codes
       WHERE user_id = $1 AND purpose = 'password_reset'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [user.id]
    );

    if (rows.length > 0 && rows[0].created_at) {
      const ageMs = Date.now() - new Date(rows[0].created_at).getTime();
      const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
      if (ageMs < cooldownMs) {
        await client.query("ROLLBACK");
        const retryAfter = Math.ceil((cooldownMs - ageMs) / 1000);
        return { code: '', notFound: false, rateLimited: true, retryAfter };
      }
    }

    const code = generateOtpCode();
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");

    await client.query(
      `DELETE FROM otp_codes WHERE user_id = $1 AND purpose = 'password_reset'`,
      [user.id]
    );
    await client.query(
      `INSERT INTO otp_codes (user_id, code_hash, purpose, expires_at)
       VALUES ($1, $2, 'password_reset', NOW() + interval '10 minutes')`,
      [user.id, codeHash]
    );

    await client.query("COMMIT");
    return { code, notFound: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function verifyPasswordResetOtp(
  email: string,
  code: string
): Promise<{ valid: boolean; resetToken?: string; reason?: "expired" | "invalid" | "max_attempts" | "not_found" }> {
  const user = await getUserByEmail(email);
  if (!user) return { valid: false, reason: "not_found" };

  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.userId, user.id), eq(otpCodes.purpose, "password_reset")));

  if (!row) return { valid: false, reason: "invalid" };

  if (row.expiresAt && row.expiresAt < new Date()) {
    await db.delete(otpCodes).where(eq(otpCodes.id, row.id));
    return { valid: false, reason: "expired" };
  }

  if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    await db.delete(otpCodes).where(eq(otpCodes.id, row.id));
    return { valid: false, reason: "max_attempts" };
  }

  const inputHash = crypto.createHash("sha256").update(code.trim()).digest("hex");
  if (inputHash !== row.codeHash) {
    await db.update(otpCodes)
      .set({ attempts: (row.attempts ?? 0) + 1 })
      .where(eq(otpCodes.id, row.id));
    return { valid: false, reason: "invalid" };
  }

  await db.delete(otpCodes).where(eq(otpCodes.id, row.id));
  const { token, rateLimited } = await createResetToken(user.id);
  if (rateLimited) {
    // re-create after short delay — just issue new token ignoring rate limit for OTP path
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db.insert(passwordResetTokens).values({
      userId: user.id, token: hashedToken,
      expiresAt: sql`NOW() + interval '1 hour'`,
      attempts: 0
    });
    return { valid: true, resetToken: rawToken };
  }
  return { valid: true, resetToken: token };
}

export async function createLoginOtp(userId: string): Promise<string> {
  const code = generateOtpCode();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  // Invalidate any previous login OTPs for this user
  await db.delete(otpCodes).where(
    and(eq(otpCodes.userId, userId), eq(otpCodes.purpose, "login"))
  );

  await db.insert(otpCodes).values({
    userId, codeHash, purpose: "login",
    expiresAt: sql`NOW() + interval '10 minutes'`
  });
  return code;
}

export async function verifyLoginOtp(
  userId: string,
  code: string
): Promise<{ valid: boolean; reason?: "expired" | "invalid" | "max_attempts" }> {
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.userId, userId), eq(otpCodes.purpose, "login")));

  if (!row) return { valid: false, reason: "invalid" };
  if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    await db.delete(otpCodes).where(eq(otpCodes.id, row.id));
    return { valid: false, reason: "max_attempts" };
  }

  const inputHash = crypto.createHash("sha256").update(code.trim()).digest("hex");
  if (inputHash !== row.codeHash) {
    await db.update(otpCodes)
      .set({ attempts: (row.attempts ?? 0) + 1 })
      .where(eq(otpCodes.id, row.id));
    return { valid: false, reason: "invalid" };
  }

  // Valid — consume it
  await db.delete(otpCodes).where(eq(otpCodes.id, row.id));
  return { valid: true };
}

export async function setTwoFactorEnabled(userId: string, enabled: boolean): Promise<void> {
  await db.update(users).set({ isTwoFactorEnabled: enabled }).where(eq(users.id, userId));
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  return user?.isTwoFactorEnabled ?? false;
}

// ─── Invite Short Links ───────────────────────────────────────────────────────

const INVITE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export async function createInviteLink(inviterUserId: string): Promise<string> {
  let code: string = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    code = Array.from({ length: 8 }, () =>
      INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)]
    ).join('');
    const existing = await db
      .select({ code: inviteLinks.code })
      .from(inviteLinks)
      .where(eq(inviteLinks.code, code));
    if (existing.length === 0) break;
  }
  await db.insert(inviteLinks).values({ code, inviterUserId });
  return code;
}

export async function resolveInviteCode(
  code: string
): Promise<{ inviterUserId: string; inviterName: string } | null> {
  const [row] = await db
    .select({ inviterUserId: inviteLinks.inviterUserId, identity: users.identity })
    .from(inviteLinks)
    .innerJoin(users, eq(users.id, inviteLinks.inviterUserId))
    .where(eq(inviteLinks.code, code));
  if (!row) return null;
  return {
    inviterUserId: row.inviterUserId,
    inviterName: row.identity || 'Friend',
  };
}
