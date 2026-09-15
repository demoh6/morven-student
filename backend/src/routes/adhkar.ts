import { Router, Request, Response } from "express";
import {
  createDhikrSubmission,
  createDhikrSubmissionSchema,
  approveDhikrSubmission,
  listApprovedAdhkar,
  listDhikrSubmissions,
  rejectDhikrSubmission,
  deleteDhikrSubmission,
  updateDhikrSubmissionContent,
  saveOfficialDhikrEdit,
  deleteOfficialDhikr,
  dhikrContentSchema,
  AdhkarError,
} from "../services/adhkar.service";
import { authenticate, optionalAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/requireRole";

const router = Router();

// POST /api/adhkar/submissions — submit a dhikr proposal (authenticated user).
// The submission always starts as PENDING and never appears as official content
// until an administrator approves it.
router.post(
  "/api/adhkar/submissions",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = createDhikrSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }

      // The user identity always comes from the authenticated session, never
      // from the client body — users cannot forge who submitted the dhikr.
      const submission = await createDhikrSubmission(req.user.sub, parsed.data);
      res.status(201).json({ submission });
    } catch (err) {
      console.error("Create dhikr submission error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// GET /api/adhkar/submissions/official — public approved dhikr only.
// PENDING/REJECTED submissions are never returned, so they can never surface
// as official content. Works for guests (optionalAuth) since approved
// submissions are meant to behave like the bundled official adhkar.
router.get(
  "/api/adhkar/submissions/official",
  optionalAuth,
  async (_req: Request, res: Response) => {
    try {
      const { adhkar, officialEdits, officialDeletions } =
        await listApprovedAdhkar();
      res.json({ adhkar, officialEdits, officialDeletions });
    } catch (err) {
      console.error("List approved adhkar error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// GET /api/admin/adhkar/submissions — list all submissions with user info (ADMIN or SUB_ADMIN only)
router.get(
  "/api/admin/adhkar/submissions",
  authenticate,
  requireAdmin(),
  async (_req: Request, res: Response) => {
    try {
      const submissions = await listDhikrSubmissions();
      res.json({ submissions });
    } catch (err) {
      console.error("List dhikr submissions error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// POST /api/admin/adhkar/submissions/:id/approve — approve a submission (ADMIN or SUB_ADMIN only)
router.post(
  "/api/admin/adhkar/submissions/:id/approve",
  authenticate,
  requireAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الطلب مطلوب" });
        return;
      }
      const submission = await approveDhikrSubmission(id, req.user.sub);
      res.json({ submission });
    } catch (err) {
      if (err instanceof AdhkarError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("Approve dhikr submission error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// POST /api/admin/adhkar/submissions/:id/reject — reject a submission (ADMIN or SUB_ADMIN only).
// Sends a rejection notification ONLY to the submitting user.
router.post(
  "/api/admin/adhkar/submissions/:id/reject",
  authenticate,
  requireAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الطلب مطلوب" });
        return;
      }
      const submission = await rejectDhikrSubmission(id, req.user.sub);
      res.json({ submission });
    } catch (err) {
      if (err instanceof AdhkarError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("Reject dhikr submission error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// PATCH /api/admin/adhkar/submissions/:id — edit a user submission's content (ADMIN or SUB_ADMIN only).
// Used to change the text of an already-visible (approved) dhikr card in place.
router.patch(
  "/api/admin/adhkar/submissions/:id",
  authenticate,
  requireAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الطلب مطلوب" });
        return;
      }
      const parsed = dhikrContentSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }
      const submission = await updateDhikrSubmissionContent(
        id,
        parsed.data,
        req.user!.sub
      );
      res.json({ submission });
    } catch (err) {
      if (err instanceof AdhkarError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("Update dhikr submission error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// DELETE /api/admin/adhkar/submissions/:id — permanently remove a submission (ADMIN or SUB_ADMIN only).
router.delete(
  "/api/admin/adhkar/submissions/:id",
  authenticate,
  requireAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الطلب مطلوب" });
        return;
      }
      await deleteDhikrSubmission(id, req.user!.sub);
      res.json({ deleted: true });
    } catch (err) {
      if (err instanceof AdhkarError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("Delete dhikr submission error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// PATCH /api/admin/adhkar/official/:id — persist an admin edit of a bundled
// official dhikr (ADMIN or SUB_ADMIN only). The bundled dataset is never modified; the
// override is merged over it at render time and served to everyone.
router.patch(
  "/api/admin/adhkar/official/:id",
  authenticate,
  requireAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الذكر مطلوب" });
        return;
      }
      const parsed = dhikrContentSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }
      const edit = await saveOfficialDhikrEdit(id, parsed.data, req.user!.sub);
      res.json({
        edit: {
          officialDhikrId: edit.officialDhikrId,
          title: edit.title,
          text: edit.text,
          source: edit.source,
        },
      });
    } catch (err) {
      console.error("Edit official dhikr error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// DELETE /api/admin/adhkar/official/:id — hide a bundled official dhikr for
// everyone by recording a tombstone (ADMIN or SUB_ADMIN only). Idempotent.
router.delete(
  "/api/admin/adhkar/official/:id",
  authenticate,
  requireAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الذكر مطلوب" });
        return;
      }
      await deleteOfficialDhikr(id, req.user!.sub);
      res.json({ deleted: true });
    } catch (err) {
      console.error("Delete official dhikr error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

export default router;