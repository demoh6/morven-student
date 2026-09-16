import { Router, Request, Response } from "express";
import {
  updateProfileSchema,
  getOwnProfile,
  updateOwnProfile,
  getPublicProfile,
  syncMyAchievements,
  getPublicAchievements,
  achievementValuesSchema,
  incrementAchievementsSchema,
  incrementMyAchievements,
} from "../services/profile.service";
import { authenticate } from "../middleware/auth";

const router = Router();

// GET /api/profile/me — get the current user's own profile (requires auth)
router.get("/api/profile/me", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    const profile = await getOwnProfile(req.user.sub);
    res.json({ profile });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// PUT /api/profile/me — update the current user's own profile (requires auth)
router.put("/api/profile/me", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ error: firstError.message });
      return;
    }

    if (Object.keys(parsed.data).length === 0) {
      res.status(400).json({ error: "لم يتم تقديم أي بيانات للتحديث" });
      return;
    }

    const profile = await updateOwnProfile(req.user.sub, parsed.data);
    res.json({ profile });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// PUT /api/profile/me/achievements — sync the current user's achievement counters (requires auth)
router.put("/api/profile/me/achievements", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    const parsed = achievementValuesSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ error: firstError.message });
      return;
    }

    await syncMyAchievements(req.user.sub, parsed.data);
    res.json({ ok: true });
  } catch (err) {
    console.error("Sync achievements error:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// POST /api/profile/me/achievements/increment — atomically add to achievement
// counters. Unlike PUT, this is additive and safe for concurrent completions.
router.post("/api/profile/me/achievements/increment", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    const parsed = incrementAchievementsSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ error: firstError.message });
      return;
    }

    const achievements = await incrementMyAchievements(req.user.sub, parsed.data);
    res.json({ achievements });
  } catch (err) {
    console.error("Increment achievements error:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// GET /api/profile/:username/achievements — get a user's public achievements (no auth required)
router.get("/api/profile/:username/achievements", async (req: Request<{ username: string }>, res: Response) => {
  try {
    const { username } = req.params;

    if (!username || username.trim().length === 0) {
      res.status(400).json({ error: "اسم المستخدم مطلوب" });
      return;
    }

    const achievements = await getPublicAchievements(username.trim());

    if (achievements === null) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    if (achievements.private === true) {
      res.status(404).json({ error: "الملف الشخصي خاص" });
      return;
    }

    res.json({ achievements });
  } catch (err) {
    console.error("Get public achievements error:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// GET /api/profile/:username — get a user's public profile (no auth required)
router.get("/api/profile/:username", async (req: Request<{ username: string }>, res: Response) => {
  try {
    const { username } = req.params;

    if (!username || username.trim().length === 0) {
      res.status(400).json({ error: "اسم المستخدم مطلوب" });
      return;
    }

    const profile = await getPublicProfile(username.trim());

    if (!profile) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    // Private profiles are returned with minimal identity only (no bio, no
    // achievements, no stats). The client renders a basic card + privacy notice.
    res.json({ profile });
  } catch (err) {
    console.error("Get public profile error:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
