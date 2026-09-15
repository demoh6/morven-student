import { Router, Request, Response } from "express";
import {
  createSuggestion,
  createSuggestionSchema,
  deleteSuggestion,
  listSuggestions,
  SuggestionError,
} from "../services/suggestion.service";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// POST /api/suggestions — submit a suggestion (authenticated user)
router.post(
  "/api/suggestions",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "غير مصرح" });
        return;
      }

      const parsed = createSuggestionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
        return;
      }

      // The user identity always comes from the authenticated session, never
      // from the client body. The "anonymous" flag records the user's choice
      // but never hides their identity from the admin.
      const suggestion = await createSuggestion(req.user.sub, parsed.data);
      res.status(201).json({ suggestion });
    } catch (err) {
      if (err instanceof SuggestionError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("Create suggestion error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// GET /api/admin/suggestions — list all suggestions with user info (ADMIN only)
router.get(
  "/api/admin/suggestions",
  authenticate,
  requireRole("ADMIN"),
  async (_req: Request, res: Response) => {
    try {
      const suggestions = await listSuggestions();
      res.json({ suggestions });
    } catch (err) {
      console.error("List suggestions error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

// DELETE /api/admin/suggestions/:id — permanently remove a suggestion (ADMIN only)
router.delete(
  "/api/admin/suggestions/:id",
  authenticate,
  requireRole("ADMIN"),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const { id } = req.params;
      if (!id || id.trim().length === 0) {
        res.status(400).json({ error: "معرف الاقتراح مطلوب" });
        return;
      }
      await deleteSuggestion(id);
      res.json({ deleted: true });
    } catch (err) {
      if (err instanceof SuggestionError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error("Delete suggestion error:", err);
      res.status(500).json({ error: "حدث خطأ في الخادم" });
    }
  }
);

export default router;
