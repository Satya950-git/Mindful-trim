import type { Express, Request, Response } from "express";
import * as storage from "../storage";
import { requireAuth } from "./middleware";

export function registerProgressionRoutes(app: Express) {
  app.get("/api/progression/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const status = await storage.getProgressionStatus(req.userId!);
      return res.json(status || {
        totalXp: 0,
        currentLevel: 0,
        currentPhase: "The Arriving",
        currentPhaseName: "The Arriving",
        currentPhaseLevelRange: "Levels 1–10",
        xpForNextLevel: 150,
        currentLevelProgressPercent: 0,
        yearProgressPercent: 0,
        completedDaysCount: 0,
        isMaxLevel: false,
        isPrestige: false,
        nextMilestone: "phase_arriving_complete",
        latestUnlockedMilestone: null,
      });
    } catch (err) {
      console.error("Progression status error:", err);
      return res.status(500).json({ message: "Failed to get progression status" });
    }
  });

  app.get("/api/progression/milestones", requireAuth, async (req: Request, res: Response) => {
    try {
      const milestones = await storage.getMilestones(req.userId!);
      return res.json(milestones);
    } catch (err) {
      console.error("Get milestones error:", err);
      return res.status(500).json({ message: "Failed to get milestones" });
    }
  });
}
