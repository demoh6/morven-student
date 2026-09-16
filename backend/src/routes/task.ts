import { Router, Request, Response } from "express";
import {
  createTaskSchema,
  updateTaskSchema,
  listMyTasks,
  createMyTask,
  updateMyTask,
  deleteMyTask,
} from "../services/task.service";
import { UserDataError } from "../services/userDataError";
import { authenticate } from "../middleware/auth";

const router = Router();

function handleUserDataError(err: unknown, res: Response): void {
  if (err instanceof UserDataError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("Tasks error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// GET /api/tasks — list the current user's tasks
router.get("/api/tasks", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    const tasks = await listMyTasks(req.user.sub);
    res.json({ tasks });
  } catch (err) {
    handleUserDataError(err, res);
  }
});

// POST /api/tasks — create a task owned by the current user
router.post("/api/tasks", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
      return;
    }

    const task = await createMyTask(req.user.sub, parsed.data);
    res.status(201).json({ task });
  } catch (err) {
    handleUserDataError(err, res);
  }
});

// PATCH /api/tasks/:id — update one of the current user's tasks
router.patch(
  "/api/tasks/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }
      if (Object.keys(parsed.data).length === 0) {
        res.status(400).json({ error: "لم يتم تقديم أي بيانات للتحديث" });
        return;
      }

      const task = await updateMyTask(req.user.sub, req.params.id, parsed.data);
      res.json({ task });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

// DELETE /api/tasks/:id — delete one of the current user's tasks
router.delete(
  "/api/tasks/:id",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      await deleteMyTask(req.user.sub, req.params.id);
      res.json({ message: "تم حذف المهمة بنجاح" });
    } catch (err) {
      handleUserDataError(err, res);
    }
  }
);

export default router;