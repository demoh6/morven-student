import { Router, Request, Response } from "express";
import { submitPomodoroSchema, submitPomodoroSession, getGroupLeaderboard, getWeeklyGroupRanking, verifyMembership, broadcastUserGroupLeaderboards } from "../services/pomodoro.service";
import { GroupError } from "../services/group.service";
import { authenticate } from "../middleware/auth";

const router = Router();

function handlePomodoroError(err: unknown, res: Response): void {
  if (err instanceof GroupError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("Pomodoro error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// POST /api/pomodoro/submit — submit a completed Pomodoro session
router.post("/api/pomodoro/submit", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const parsed = submitPomodoroSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const { groupId, durationSeconds, sessionId } = parsed.data;
    const result = await submitPomodoroSession(
      req.user.sub,
      groupId,
      durationSeconds,
      sessionId,
    );

    // Broadcast the updated leaderboard to EVERY group the user belongs to
    // (focus time is personal, so all of them changed), best-effort only —
    // the database is already authoritative and a missed event self-heals on
    // the next fetch.
    await broadcastUserGroupLeaderboards(req.user.sub);

    res.status(201).json(result);
  } catch (err) {
    handlePomodoroError(err, res);
  }
});

// GET /api/groups/:groupId/leaderboard — get group leaderboard
router.get("/api/groups/:groupId/leaderboard", authenticate, async (req: Request<{ groupId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    // Only group members (or a system ADMIN) may view the leaderboard
    await verifyMembership(req.user.sub, req.params.groupId, req.user.role);

    const leaderboard = await getGroupLeaderboard(req.params.groupId);
    res.json({ leaderboard });
  } catch (err) {
    handlePomodoroError(err, res);
  }
});

// GET /api/groups/:groupId/leaderboard/weekly — current weekly competition
// ranking (Saturday 00:00 → Friday 23:59:59, configured weekly timezone) with
// each member's current-day total (resets at local 00:00). The backend derives
// both periods from the current date/time, so the ranking automatically resets
// each Saturday and the daily total each midnight without any reset job.
router.get("/api/groups/:groupId/leaderboard/weekly", authenticate, async (req: Request<{ groupId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    await verifyMembership(req.user.sub, req.params.groupId, req.user.role);

    const result = await getWeeklyGroupRanking(req.params.groupId);
    res.json({
      weekStart: result.weekStart.toISOString(),
      weekEnd: result.weekEnd.toISOString(),
      dayStart: result.dayStart.toISOString(),
      nextDayStart: result.nextDayStart.toISOString(),
      ranking: result.ranking,
    });
  } catch (err) {
    handlePomodoroError(err, res);
  }
});

export default router;
