import { Router, Request, Response } from "express";
import {
  listUsers,
  updateUserRole,
  updateRoleSchema,
  AdminError,
} from "../services/admin.service";
import { authenticate } from "../middleware/auth";
import { requireMainAdmin } from "../middleware/requireRole";

const router = Router();

// GET /api/admin/users — list all users (ADMIN only; SUB_ADMIN forbidden —
// this endpoint also exposes every user's role, an admin-system concern)
router.get(
  "/api/admin/users",
  authenticate,
  requireMainAdmin(),
  async (_req: Request, res: Response) => {
    try {
      const users = await listUsers();
      res.json({ users });
    } catch (err) {
      console.error("List users error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// PATCH /api/admin/users/:id/role — change a user's role (ADMIN only)
router.patch(
  "/api/admin/users/:id/role",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف المستخدم مطلوب" });
        return;
      }

      const parsed = updateRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        res.status(400).json({ error: firstError.message });
        return;
      }

      const user = await updateUserRole(id, parsed.data.role);
      res.json({ user });
    } catch (err) {
      if (err instanceof AdminError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("Update user role error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

export default router;
