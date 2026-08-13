/**
 * exerciseSeed.ts
 *
 * One-time seeding for the exercise_library table.
 * Reads from the static data files and inserts all 800 exercises (with Hindi
 * translations) into PostgreSQL. Safe to call on every server start — skips
 * seeding if the table already has data.
 */

import { db } from "./db";
import { exerciseLibrary } from "@shared/schema";
import { exercises } from "../data/exercises";
import { exercisesHi } from "../data/exercises_hi";
import { insightsHi } from "../data/insights_hi";

const BATCH_SIZE = 100;

export async function seedExercises(): Promise<void> {
  try {
    const existing = await db.select().from(exerciseLibrary).limit(1);
    if (existing.length > 0) return;

    const rows = exercises.map((e) => ({
      exerciseId: e.exerciseId,
      pillar: e.pillar,
      moodScore: e.moodScore,
      stateDescriptor: e.stateDescriptor,
      exerciseName: e.exerciseName,
      durationMinutes: e.durationMinutes,
      difficulty: e.difficulty ?? null,
      description: e.description,
      xpReward: e.xpReward,
      insights: e.insights ?? null,
      nameHi: exercisesHi[e.exerciseId]?.name ?? null,
      descriptionHi: exercisesHi[e.exerciseId]?.description ?? null,
      insightsHi: insightsHi[e.exerciseId] ?? null,
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await db.insert(exerciseLibrary).values(rows.slice(i, i + BATCH_SIZE));
    }

    console.log(
      `[seed] Inserted ${rows.length} exercises into exercise_library.`
    );
  } catch (err) {
    console.error("[seed] Exercise seeding failed:", err);
  }
}
