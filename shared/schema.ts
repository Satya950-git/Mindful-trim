import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, serial, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  identity: text("identity").default(""),
  uniqueTag: varchar("unique_tag", { length: 4 }),
  gender: text("gender").default(""),
  tonePreference: text("tone_preference").default(""),
  compass: text("compass").default(""),
  isOnboarded: boolean("is_onboarded").default(false),
  profilePhoto: text("profile_photo").default(''),
  countryCode: text("country_code"),
  phoneNumber: text("phone_number"),
  whatsappOptIn: boolean("whatsapp_opt_in").default(false),
  pushToken: text("push_token"),
  securityQuestion: text("security_question"),
  securityAnswerHash: text("security_answer_hash"),
  isTwoFactorEnabled: boolean("is_two_factor_enabled").default(true),
  subscriptionType: varchar("subscription_type", { length: 1 }).default("F"),
  validTill: timestamp("valid_till"),
  language: varchar("language", { length: 10 }).default("en").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  unique("users_identity_tag_uniq").on(t.identity, t.uniqueTag),
]);

export const userState = pgTable("user_state", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  totalDaysAligned: integer("total_days_aligned").default(0),
  lastCompletedTimestamp: text("last_completed_timestamp"),
  lastCompletedDate: text("last_completed_date"),
  lastPillar: text("last_pillar"),
  totalXp: integer("total_xp").default(0),
  currentLevel: integer("current_level").default(0),
  currentPhase: text("current_phase").default('The Arriving'),
  dailyNextsUsed: integer("daily_nexts_used").default(0),
  lastNextDate: text("last_next_date"),
});

export const progressionEvents = pgTable("progression_events", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  xpGained: integer("xp_gained").notNull(),
  levelBefore: integer("level_before").notNull(),
  levelAfter: integer("level_after").notNull(),
  phaseBefore: text("phase_before").notNull(),
  phaseAfter: text("phase_after").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("progression_events_user_idx").on(t.userId),
  index("progression_events_user_created_idx").on(t.userId, t.createdAt),
]);

export const progressionMilestones = pgTable("progression_milestones", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  milestoneKey: varchar("milestone_key", { length: 100 }).notNull(),
  levelReached: integer("level_reached").notNull(),
  triggeredAt: timestamp("triggered_at").defaultNow(),
});

export const exerciseHistory = pgTable("exercise_history", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  pillar: text("pillar").notNull(),
  usedExerciseIds: jsonb("used_exercise_ids").default([]),
}, (t) => [
  index("exercise_history_user_pillar_idx").on(t.userId, t.pillar),
]);

export const dailyLogs = pgTable("daily_logs", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  pillar: text("pillar").notNull(),
  exerciseId: text("exercise_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  difficulty: text("difficulty").default("easy"),
  moodBefore: integer("mood_before").default(5),
  contextTags: jsonb("context_tags").default([]),
  completedAt: text("completed_at").notNull(),
  mode: varchar("mode", { length: 20 }).default("alignment"),
}, (t) => [
  index("daily_logs_user_date_idx").on(t.userId, t.date),
  index("daily_logs_user_idx").on(t.userId),
]);

export const taskInstances = pgTable("task_instances", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  exerciseId: text("exercise_id").notNull(),
  exerciseDate: text("exercise_date").notNull(),
  difficulty: text("difficulty").default("easy"),
  xpAwarded: boolean("xp_awarded").default(false),
  isRetry: boolean("is_retry").default(false),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  appVersion: text("app_version").default("1.0.0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const otpCodes = pgTable("otp_codes", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  purpose: varchar("purpose", { length: 20 }).notNull().default("login"),
  attempts: integer("attempts").default(0),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("otp_codes_user_purpose_idx").on(t.userId, t.purpose),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  timeSlot: varchar("time_slot", { length: 10 }).notNull(),
  messageText: text("message_text").notNull(),
  messageTextHi: text("message_text_hi"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const appConfig = pgTable("app_config", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const exerciseLibrary = pgTable("exercise_library", {
  exerciseId: varchar("exercise_id", { length: 20 }).primaryKey(),
  pillar: varchar("pillar", { length: 20 }).notNull(),
  moodScore: integer("mood_score").notNull(),
  stateDescriptor: varchar("state_descriptor", { length: 50 }).notNull(),
  exerciseName: text("exercise_name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  difficulty: varchar("difficulty", { length: 20 }),
  description: text("description").notNull(),
  xpReward: integer("xp_reward").notNull().default(100),
  insights: text("insights"),
  nameHi: text("name_hi"),
  descriptionHi: text("description_hi"),
  insightsHi: text("insights_hi"),
});

// ─── Habits Feature ───────────────────────────────────────────────────────────

export const habitLibrary = pgTable("habit_library", {
  habitId: varchar("habit_id", { length: 20 }).primaryKey(),
  timeBlock: varchar("time_block", { length: 20 }).notNull(),
  pillar: varchar("pillar", { length: 20 }).notNull(),
  habitName: text("habit_name").notNull(),
  description: text("description").notNull(),
});

export const userHabits = pgTable("user_habits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  habitId: varchar("habit_id", { length: 20 }).notNull().references(() => habitLibrary.habitId),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isCoOp: boolean("is_co_op").notNull().default(false),
  partnerId: varchar("partner_id").references(() => users.id, { onDelete: "set null" }),
  journeyStartDate: text("journey_start_date"),
  journeyTargetDays: integer("journey_target_days"),
  habitStatus: varchar("habit_status", { length: 20 }).notNull().default("active"),
  addedAt: timestamp("added_at").defaultNow(),
}, (t) => [
  index("user_habits_user_idx").on(t.userId),
  index("user_habits_user_habit_idx").on(t.userId, t.habitId),
  unique("user_habits_user_habit_uniq").on(t.userId, t.habitId),
]);

export const habitLogs = pgTable("habit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  habitId: varchar("habit_id", { length: 20 }).notNull().references(() => habitLibrary.habitId),
  date: text("date").notNull(),
  completedAt: timestamp("completed_at").defaultNow(),
}, (t) => [
  index("habit_logs_user_date_idx").on(t.userId, t.date),
  unique("habit_logs_user_habit_date_uniq").on(t.userId, t.habitId, t.date),
]);

export const dailyFuelLogs = pgTable("daily_fuel_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(),
  hydration: integer("hydration").notNull().default(5),
  sleep: integer("sleep").notNull().default(5),
  energy: integer("energy").notNull().default(5),
  loggedAt: timestamp("logged_at").defaultNow(),
}, (t) => [
  index("daily_fuel_user_date_idx").on(t.userId, t.date),
  unique("daily_fuel_user_date_uniq").on(t.userId, t.date),
]);

export type HabitLibraryItem = typeof habitLibrary.$inferSelect;
export type UserHabit = typeof userHabits.$inferSelect;
export type HabitLog = typeof habitLogs.$inferSelect;
export type DailyFuelLog = typeof dailyFuelLogs.$inferSelect;

// ─── Friendships ──────────────────────────────────────────────────────────────

export const friendships = pgTable("friendships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requesterId: varchar("requester_id").notNull().references(() => users.id),
  addresseeId: varchar("addressee_id").notNull().references(() => users.id),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("friendships_requester_idx").on(t.requesterId),
  index("friendships_addressee_idx").on(t.addresseeId),
  unique("friendships_pair_uniq").on(t.requesterId, t.addresseeId),
]);

export type Friendship = typeof friendships.$inferSelect;

// ─── Trusted Devices ──────────────────────────────────────────────────────────

export const trustedDevices = pgTable("trusted_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => [
  index("trusted_devices_user_idx").on(t.userId),
]);

export type TrustedDevice = typeof trustedDevices.$inferSelect;

// ─── User Notification Inbox ──────────────────────────────────────────────────

export const userNotifications = pgTable("user_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 30 }).notNull().default("GENERAL"),
  challengeType: varchar("challenge_type", { length: 20 }),
  challengeId: varchar("challenge_id"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  clickedAt: timestamp("clicked_at"),
}, (t) => [
  index("user_notifications_user_idx").on(t.userId),
  index("user_notifications_user_created_idx").on(t.userId, t.createdAt),
  index("user_notifications_user_read_idx").on(t.userId, t.isRead),
]);

export type UserNotification = typeof userNotifications.$inferSelect;

// ─── Invite Short Links ───────────────────────────────────────────────────────

export const inviteLinks = pgTable("invite_links", {
  code: varchar("code", { length: 12 }).primaryKey(),
  inviterUserId: varchar("inviter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [
  index("invite_links_inviter_idx").on(t.inviterUserId),
]);

export type InviteLink = typeof inviteLinks.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UserState = typeof userState.$inferSelect;
export type ExerciseHistory = typeof exerciseHistory.$inferSelect;
export type DailyLog = typeof dailyLogs.$inferSelect;
export type TaskInstance = typeof taskInstances.$inferSelect;
export type ProgressionEvent = typeof progressionEvents.$inferSelect;
export type ProgressionMilestone = typeof progressionMilestones.$inferSelect;
export type ExerciseLibraryItem = typeof exerciseLibrary.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
