import type { Express, Request, Response } from "express";
import { db } from "../db";
import { exerciseLibrary } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as storage from "../storage";
import { DAILY_NEXT_LIMIT } from "../progressionEngine";
import { requireAuth } from "./middleware";

const VALID_PILLARS = ["Mental", "Physical", "Social", "Spiritual"] as const;

export function registerExerciseRoutes(app: Express) {
  app.get("/api/exercises", async (req: Request, res: Response) => {
    const { pillar } = req.query;
    if (!pillar || typeof pillar !== "string") {
      return res.status(400).json({ error: "pillar query param required" });
    }
    if (!(VALID_PILLARS as readonly string[]).includes(pillar)) {
      return res.status(400).json({ error: "Invalid pillar" });
    }
    try {
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      const rows = await db
        .select()
        .from(exerciseLibrary)
        .where(eq(exerciseLibrary.pillar, pillar));
      return res.json(
        rows.map((r) => ({
          exerciseId: r.exerciseId,
          pillar: r.pillar,
          moodScore: r.moodScore,
          stateDescriptor: r.stateDescriptor,
          exerciseName: r.exerciseName,
          durationMinutes: r.durationMinutes,
          difficulty: r.difficulty ?? undefined,
          description: r.description,
          xpReward: r.xpReward,
          insights: r.insights ?? undefined,
          nameHi: r.nameHi ?? undefined,
          descriptionHi: r.descriptionHi ?? undefined,
          insightsHi: r.insightsHi ?? undefined,
        }))
      );
    } catch (err) {
      console.error("[exercises] GET failed:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/exercise/next-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const status = await storage.getNextStatus(req.userId!);
      return res.json(status);
    } catch (err) {
      console.error("Next status error:", err);
      return res.status(500).json({ message: "Failed to get next status" });
    }
  });

  app.post("/api/exercise/next", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.recordNext(req.userId!);
      if (!result.wasRecorded) {
        return res.status(429).json({
          message: `Daily limit of ${DAILY_NEXT_LIMIT} skips reached`,
          ...result,
        });
      }
      return res.json(result);
    } catch (err) {
      console.error("Next exercise error:", err);
      return res.status(500).json({ message: "Failed to record next" });
    }
  });
}
