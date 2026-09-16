import { Router, Request, Response } from "express";
import {
  upsertAdhkarProgressSchema,
  dayString,
  getMyAdhkarProgress,
  upsertMyAdhkarProgress,
} from "../services/adhkarProgress.service";
import { UserDataError } from "../services/userDataError";
import { authenticate } from "../middleware/auth";

const router = Router();

function handleUserDataError(err: unknown, res: Response): void {
  if (err instanceof UserDataError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("Adhkar progress error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

function validateDayParam(param: string, res: Response): string | null {
  const parsed = dayString.safeParse(param);
  if (!parsed.success) {
    res.status(400).json({ error: "اليوم يجب أن يكون بصيغة YYYY-MM-DD" });
    return null;
  }
  return parsed.data;
}

// GET /api/adhkar/progress/:day — the current user's progress for one day.
// (Separate from the DhikrSubmission/approval admin flow — untouched.)
router.get(
  "/api/adhkar/progress/:day",
  authenticate,
  async (req: Request<{ day: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const day = validateDayParam(req.params.day, res);
      if (!day) return;

      const progress = await getMyAdhkarProgress(req.user.sub, day);
      res.json({ progress });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// PUT /api/adhkar/progress/:day — upsert the current user's progress for one day.
router.put(
  "/api/adhkar/progress/:day",
  authenticate,
  async (req: Request<{ day: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const day = validateDayParam(req.params.day, res);
      if (!day) return;

      const parsed = upsertAdhkarProgressSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }

      const progress = await upsertMyAdhkarProgress(req.user.sub, day, parsed.data);
      res.json({ progress });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

export default router;