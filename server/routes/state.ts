import type { Express, Request, Response } from "express";
import * as storage from "../storage";
import { getBaseXpByDifficulty, calculateScaledXp } from "../progressionEngine";
import { requireAuth } from "./middleware";

export function registerStateRoutes(app: Express) {
  app.get("/api/state", requireAuth, async (req: Request, res: Response) => {
    try {
      const state = await storage.getState(req.userId!);
      const nextStatus = await storage.getNextStatus(req.userId!);
      return res.json(state ? { ...state, ...nextStatus } : {
        totalDaysAligned: 0,
        lastCompletedTimestamp: null,
        lastCompletedDate: null,
        lastPillar: null,
        totalXp: 0,
        currentLevel: 0,
        currentPhase: "The Arriving",
        ...nextStatus,
      });
    } catch (err) {
      console.error("Get state error:", err);
      return res.status(500).json({ message: "Failed to get state" });
    }
  });

  app.post("/api/complete", requireAuth, async (req: Request, res: Response) => {
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
        contextTags,
      } = req.body;

      if (!exerciseId || !lastCompletedDate) {
        return res.status(400).json({ message: "exerciseId and lastCompletedDate required" });
      }

      const { xpToAward, isRetry, mode } = await storage.markTaskCompletedSafely(
        req.userId!,
        exerciseId,
        lastCompletedDate,
        exerciseDifficulty || "easy"
      );

      const trueTotalDaysAligned = mode === "alignment"
        ? await storage.countAlignedDays(req.userId!)
        : undefined;

      const logData = {
        date: lastCompletedDate,
        pillar: pillar || lastPillar || "Mental",
        exerciseId,
        exerciseName: exerciseName || "",
        difficulty: exerciseDifficulty || "easy",
        moodBefore: moodBefore ?? 3,
        contextTags: contextTags || [],
        completedAt: new Date().toISOString(),
        mode,
      };

      const stateUpdate = mode === "alignment"
        ? { totalDaysAligned: trueTotalDaysAligned!, lastCompletedTimestamp, lastCompletedDate, lastPillar }
        : { lastPillar };

      const [savedLog, stateResult] = await Promise.all([
        storage.addLog(req.userId!, logData),
        storage.updateState(
          req.userId!,
          stateUpdate,
          xpToAward > 0 ? xpToAward : undefined
        ),
      ]);

      return res.json({
        log: savedLog,
        state: stateResult.state,
        progression: stateResult.progression,
        xpAwarded: xpToAward,
        isRetry,
        mode,
      });
    } catch (err) {
      console.error("Complete error:", err);
      return res.status(500).json({ message: "Failed to complete exercise" });
    }
  });

  app.get("/api/activity/last-3-days", requireAuth, async (req: Request, res: Response) => {
    try {
      const activity = await storage.getLast3DaysActivity(req.userId!);
      return res.json(activity);
    } catch (err) {
      console.error("Activity error:", err);
      return res.status(500).json({ message: "Failed to get activity" });
    }
  });

  app.put("/api/state", requireAuth, async (req: Request, res: Response) => {
    try {
      const { xpToAdd, exerciseDifficulty, ...stateData } = req.body;

      let finalXp: number | undefined;
      if (exerciseDifficulty) {
        const state = await storage.getState(req.userId!);
        const currentLevel = state?.currentLevel ?? 0;
        const base = getBaseXpByDifficulty(exerciseDifficulty);
        finalXp = calculateScaledXp(base, currentLevel);
      } else if (xpToAdd) {
        finalXp = xpToAdd;
      }

      const { state, progression } = await storage.updateState(
        req.userId!,
        stateData,
        finalXp
      );
      return res.json({ state, progression });
    } catch (err) {
      console.error("Update state error:", err);
      return res.status(500).json({ message: "Failed to update state" });
    }
  });

  app.get("/api/logs", requireAuth, async (req: Request, res: Response) => {
    try {
      const logs = await storage.getLogs(req.userId!);
      return res.json(logs);
    } catch (err) {
      console.error("Get logs error:", err);
      return res.status(500).json({ message: "Failed to get logs" });
    }
  });

  app.post("/api/logs", requireAuth, async (req: Request, res: Response) => {
    try {
      const log = await storage.addLog(req.userId!, req.body);
      return res.json(log);
    } catch (err) {
      console.error("Add log error:", err);
      return res.status(500).json({ message: "Failed to add log" });
    }
  });

  app.get("/api/history", requireAuth, async (req: Request, res: Response) => {
    try {
      const history = await storage.getHistory(req.userId!);
      return res.json(history);
    } catch (err) {
      console.error("Get history error:", err);
      return res.status(500).json({ message: "Failed to get history" });
    }
  });

  app.put("/api/history", requireAuth, async (req: Request, res: Response) => {
    try {
      const { pillar, usedExerciseIds } = req.body;
      await storage.updateHistory(req.userId!, pillar, usedExerciseIds);
      return res.json({ success: true });
    } catch (err) {
      console.error("Update history error:", err);
      return res.status(500).json({ message: "Failed to update history" });
    }
  });

  app.post("/api/reset-today", requireAuth, async (req: Request, res: Response) => {
    try {
      const { todayDate } = req.body;
      if (!todayDate) {
        return res.status(400).json({ message: "todayDate required" });
      }
      await storage.resetTodayData(req.userId!, todayDate);
      return res.json({ message: "Today reset successfully" });
    } catch (err) {
      console.error("Reset today error:", err);
      return res.status(500).json({ message: "Failed to reset today" });
    }
  });

  app.post("/api/reset", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.resetUserData(req.userId!);
      return res.json({ success: true });
    } catch (err) {
      console.error("Reset error:", err);
      return res.status(500).json({ message: "Failed to reset data" });
    }
  });
}
