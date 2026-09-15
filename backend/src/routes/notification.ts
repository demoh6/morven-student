import { Router, Request, Response } from "express";
import {
  createNotificationSchema,
  listNotifications,
  createNotification,
  deleteNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  unmarkNotificationRead,
} from "../services/notification.service";
import { authenticate } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireRole";

const router = Router();

// GET /api/notifications — list global notifications (authenticated users)
router.get(
  "/api/notifications",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const notifications = await listNotifications(req.user.sub);
      res.json({ notifications });
    } catch (err) {
      console.error("List notifications error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// POST /api/notifications/:id/read — mark a notification as read for the current user
router.post(
  "/api/notifications/:id/read",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الإشعار مطلوب" });
        return;
      }
      const marked = await markNotificationAsRead(req.user.sub, id);
      if (!marked) {
        res.status(404).json({ error: "الإشعار غير موجود" });
        return;
      }
      res.json({ message: "تم تحديد الإشعار كمقروء" });
    } catch (err) {
      console.error("Mark notification read error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// POST /api/notifications/read-all — mark all notifications as read for the current user
router.post(
  "/api/notifications/read-all",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      await markAllNotificationsAsRead(req.user.sub);
      res.json({ message: "تم تحديد جميع الإشعارات كمقروءة" });
    } catch (err) {
      console.error("Mark all notifications read error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// DELETE /api/notifications/:id/read — mark a notification as unread for the current user
router.delete(
  "/api/notifications/:id/read",
  authenticate,
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الإشعار مطلوب" });
        return;
      }
      await unmarkNotificationRead(req.user.sub, id);
      res.json({ message: "تم تحديد الإشعار كغير مقروء" });
    } catch (err) {
      console.error("Unmark notification read error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// POST /api/notifications — create a GLOBAL notification (ADMIN or SUB_ADMIN only)
router.post(
  "/api/notifications",
  authenticate,
  requireAdmin(),
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = createNotificationSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        res.status(400).json({ error: firstError.message });
        return;
      }

      const notification = await createNotification(parsed.data, req.user.sub);
      res.status(201).json({ notification });
    } catch (err) {
      console.error("Create notification error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// DELETE /api/notifications/:id — delete a GLOBAL notification (ADMIN or SUB_ADMIN only)
router.delete(
  "/api/notifications/:id",
  authenticate,
  requireAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الإشعار مطلوب" });
        return;
      }

      const deleted = await deleteNotification(id);
      if (!deleted) {
        res.status(404).json({ error: "الإشعار غير موجود" });
        return;
      }

      res.json({ message: "تم حذف الإشعار بنجاح" });
    } catch (err) {
      console.error("Delete notification error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

export default router;