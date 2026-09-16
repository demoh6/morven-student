import { Router, Request, Response } from "express";
import {
  updatePreferencesSchema,
  getMyPreferences,
  updateMyPreferences,
} from "../services/userPreference.service";
import { authenticate } from "../middleware/auth";

const router = Router();

// GET /api/preferences — the current user's preferences (one row per user).
router.get(
  "/api/preferences",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const preferences = await getMyPreferences(req.user.sub);
      res.json({ preferences });
    } catch (err) {
      console.error("Get preferences error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// PATCH /api/preferences — update the current user's preferences (safe upsert).
router.patch(
  "/api/preferences",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = updatePreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ error: "لم يتم تقديم أي بيانات للتحديث" });
        return;
      }

      const preferences = await updateMyPreferences(req.user.sub, parsed.data);
      res.json({ preferences });
    } catch (err) {
      console.error("Update preferences error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

export default router;