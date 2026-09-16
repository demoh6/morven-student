import { Router, Request, Response } from "express";
import {
  recordSessionSchema,
  mergePomodoroStatsSchema,
  getMyPomodoroStats,
  recordMyPomodoroSession,
  mergeMyPomodoroStats,
} from "../services/pomodoroStats.service";
import { authenticate } from "../middleware/auth";

const router = Router();

// GET /api/pomodoro/me/stats — the current user's PERSONAL stats.
// (Group competition lives under /api/pomodoro/submit and the leaderboards;
// personal stats are a separate, additively-updated counter row.)
router.get(
  "/api/pomodoro/me/stats",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const stats = await getMyPomodoroStats(req.user.sub);
      res.json({ stats });
    } catch (err) {
      console.error("Get pomodoro stats error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// POST /api/pomodoro/me/stats — record one completed personal focus session.
// Atomic increments make multi-device updates safe (no counter overwrites).
router.post(
  "/api/pomodoro/me/stats",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = recordSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }

      const stats = await recordMyPomodoroSession(req.user.sub, parsed.data);
      res.status(201).json({ stats });
    } catch (err) {
      console.error("Record pomodoro session error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// POST /api/pomodoro/me/stats/merge — one-time migration of a guest device's
// LIFETIME counters into the account row. Element-wise MAX merge, idempotent,
// never destructive. Not used by the live per-session flow.
router.post(
  "/api/pomodoro/me/stats/merge",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = mergePomodoroStatsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }

      const stats = await mergeMyPomodoroStats(req.user.sub, parsed.data);
      res.json({ stats });
    } catch (err) {
      console.error("Merge pomodoro stats error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

export default router;