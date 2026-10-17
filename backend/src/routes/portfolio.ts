import { Router, Request, Response } from "express";
import {
  universitySchema,
  updateUniversitySchema,
  cohortSchema,
  updateCohortSchema,
  courseSchema,
  updateCourseSchema,
  templateSchema,
  updateTemplateSchema,
  templateStatusSchema,
  listUniversities,
  listCohorts,
  listCourses,
  getCatalog,
  getPublishedTemplate,
  adminListUniversities,
  createUniversity,
  updateUniversity,
  deleteUniversity,
  adminListCohorts,
  createCohort,
  updateCohort,
  deleteCohort,
  adminListCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  adminListTemplates,
  getTemplateDetails,
  createTemplate,
  updateTemplate,
  setTemplateStatus,
  deleteTemplate,
  PortfolioError,
} from "../services/portfolio.service";
import { authenticate } from "../middleware/auth";
import { requireMainAdmin } from "../middleware/requireRole";

const router = Router();

function handlePortfolioError(err: unknown, res: Response): void {
  if (err instanceof PortfolioError) {
    res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }
  console.error("Portfolio error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

/** Parses a zod schema or writes a 400 and returns null. */
function parseBody<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, body: unknown, res: Response): T | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
    return null;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Catalog — read (any authenticated user)
// ---------------------------------------------------------------------------

router.get("/api/portfolio/universities", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const universities = await listUniversities();
    res.json({ universities });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.get("/api/portfolio/catalog", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const catalog = await getCatalog();
    res.json(catalog);
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.get(
  "/api/portfolio/universities/:universityId/cohorts",
  authenticate,
  async (req: Request<{ universityId: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const cohorts = await listCohorts(req.params.universityId);
      res.json({ cohorts });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.get(
  "/api/portfolio/universities/:universityId/courses",
  authenticate,
  async (req: Request<{ universityId: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const cohortId = typeof req.query.cohortId === "string" ? req.query.cohortId : undefined;
      const courses = await listCourses(req.params.universityId, cohortId);
      res.json({ courses });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.get(
  "/api/portfolio/template",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const { universityId, cohortId, courseId } = req.query;
      if (typeof universityId !== "string" || typeof cohortId !== "string" || typeof courseId !== "string") {
        res.status(400).json({ error: "معلمات غير صالحة" });
        return;
      }
      const template = await getPublishedTemplate(universityId, cohortId, courseId);
      res.json({ template });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

// ---------------------------------------------------------------------------
// Admin — catalog management (main ADMIN only)
// ---------------------------------------------------------------------------

router.get("/api/admin/portfolio/universities", authenticate, requireMainAdmin(), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const universities = await adminListUniversities();
    res.json({ universities });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.post("/api/admin/portfolio/universities", authenticate, requireMainAdmin(), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const input = parseBody(universitySchema, req.body, res);
    if (!input) return;
    const university = await createUniversity(input);
    res.status(201).json({ university });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.patch(
  "/api/admin/portfolio/universities/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const input = parseBody(updateUniversitySchema, req.body, res);
      if (!input) return;
      const university = await updateUniversity(req.params.id, input);
      res.json({ university });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.delete(
  "/api/admin/portfolio/universities/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      await deleteUniversity(req.params.id);
      res.json({ message: "تم حذف الجامعة بنجاح" });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.get("/api/admin/portfolio/cohorts", authenticate, requireMainAdmin(), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const universityId = typeof req.query.universityId === "string" ? req.query.universityId : undefined;
    const cohorts = await adminListCohorts(universityId);
    res.json({ cohorts });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.post("/api/admin/portfolio/cohorts", authenticate, requireMainAdmin(), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const input = parseBody(cohortSchema, req.body, res);
    if (!input) return;
    const cohort = await createCohort(input);
    res.status(201).json({ cohort });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.patch(
  "/api/admin/portfolio/cohorts/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const input = parseBody(updateCohortSchema, req.body, res);
      if (!input) return;
      const cohort = await updateCohort(req.params.id, input);
      res.json({ cohort });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.delete(
  "/api/admin/portfolio/cohorts/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      await deleteCohort(req.params.id);
      res.json({ message: "تم حذف الدفعة بنجاح" });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.get("/api/admin/portfolio/courses", authenticate, requireMainAdmin(), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const universityId = typeof req.query.universityId === "string" ? req.query.universityId : undefined;
    const courses = await adminListCourses(universityId);
    res.json({ courses });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.post("/api/admin/portfolio/courses", authenticate, requireMainAdmin(), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const input = parseBody(courseSchema, req.body, res);
    if (!input) return;
    const course = await createCourse(input);
    res.status(201).json({ course });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.patch(
  "/api/admin/portfolio/courses/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const input = parseBody(updateCourseSchema, req.body, res);
      if (!input) return;
      const course = await updateCourse(req.params.id, input);
      res.json({ course });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.delete(
  "/api/admin/portfolio/courses/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      await deleteCourse(req.params.id);
      res.json({ message: "تم حذف المقرر بنجاح" });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

// ---------------------------------------------------------------------------
// Admin — template management (main ADMIN only)
// ---------------------------------------------------------------------------

router.get("/api/admin/portfolio/templates", authenticate, requireMainAdmin(), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const universityId = typeof req.query.universityId === "string" ? req.query.universityId : undefined;
    const templates = await adminListTemplates(universityId);
    res.json({ templates });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.get(
  "/api/admin/portfolio/templates/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const template = await getTemplateDetails(req.params.id);
      res.json({ template });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.post("/api/admin/portfolio/templates", authenticate, requireMainAdmin(), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const input = parseBody(templateSchema, req.body, res);
    if (!input) return;
    const template = await createTemplate(input);
    res.status(201).json({ template });
  } catch (err) {
    handlePortfolioError(err, res);
  }
});

router.patch(
  "/api/admin/portfolio/templates/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const input = parseBody(updateTemplateSchema, req.body, res);
      if (!input) return;
      const template = await updateTemplate(req.params.id, input);
      res.json({ template });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.patch(
  "/api/admin/portfolio/templates/:id/status",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const input = parseBody(templateStatusSchema, req.body, res);
      if (!input) return;
      const template = await setTemplateStatus(req.params.id, input.status);
      res.json({ template });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

router.delete(
  "/api/admin/portfolio/templates/:id",
  authenticate,
  requireMainAdmin(),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      await deleteTemplate(req.params.id);
      res.json({ message: "تم حذف القالب بنجاح" });
    } catch (err) {
      handlePortfolioError(err, res);
    }
  },
);

export default router;
