import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import {
  createResourceSchema,
  updateResourceSchema,
  addNoteSchema,
  addLinkSchema,
  accessPrivateResourceSchema,
  listResources,
  createResource,
  getResourceDetails,
  updateResource,
  deleteResource,
  accessPrivateResource,
  accessPrivateResourceByCode,
  addFiles,
  listFiles,
  getDownloadableFile,
  deleteResourceFile,
  addNote,
  deleteResourceNote,
  addLink,
  deleteResourceLink,
  ResourceError,
} from "../services/resource.service";
import { authenticate } from "../middleware/auth";
import { uploadResource } from "../middleware/uploadResource";

const router = Router();

const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads", "resources");

function handleResourceError(err: unknown, res: Response): void {
  if (err instanceof ResourceError) {
    res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    return;
  }
  console.error("Resource error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

// GET /api/resources — list visible resources (any authenticated user)
router.get("/api/resources", authenticate, async (_req: Request, res: Response) => {
  try {
    if (!_req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const resources = await listResources(_req.user.sub, _req.user.role);
    res.json({ resources });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// POST /api/resources — create a resource (any authenticated user)
router.post("/api/resources", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    // Accept lowercase type values from the client and map to the enum.
    const parsed = createResourceSchema.safeParse({
      ...req.body,
      type: req.body?.type?.toUpperCase(),
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const resource = await createResource(req.user.sub, parsed.data);
    res.status(201).json({ resource });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// GET /api/resources/:resourceId — get resource details incl. content
router.get("/api/resources/:resourceId", authenticate, async (req: Request<{ resourceId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const resource = await getResourceDetails(req.params.resourceId, req.user.sub, req.user.role);
    res.json({ resource });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// POST /api/resources/access — add a private resource to the caller's list
// using ONLY its 6-digit code (no resource ID required).
router.post("/api/resources/access", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const parsed = accessPrivateResourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const resource = await accessPrivateResourceByCode(req.user.sub, req.user.role, parsed.data.code);
    res.json({ resource });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// POST /api/resources/:resourceId/access — unlock a private resource with a 6-digit code
router.post("/api/resources/:resourceId/access", authenticate, async (req: Request<{ resourceId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const parsed = accessPrivateResourceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const resource = await accessPrivateResource(
      req.params.resourceId,
      req.user.sub,
      req.user.role,
      parsed.data.code,
    );
    res.json({ resource });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// PATCH /api/resources/:resourceId — update resource (admin or owner)
router.patch("/api/resources/:resourceId", authenticate, async (req: Request<{ resourceId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const parsed = updateResourceSchema.safeParse({
      ...req.body,
      type: req.body?.type?.toUpperCase(),
    });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const resource = await updateResource(
      req.params.resourceId,
      req.user.sub,
      req.user.role,
      parsed.data,
    );
    res.json({ resource });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// DELETE /api/resources/:resourceId — delete resource (admin or owner)
router.delete("/api/resources/:resourceId", authenticate, async (req: Request<{ resourceId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    await deleteResource(req.params.resourceId, req.user.sub, req.user.role);
    res.json({ message: "تم حذف المورد بنجاح" });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// GET /api/resources/:resourceId/files — list resource files
router.get("/api/resources/:resourceId/files", authenticate, async (req: Request<{ resourceId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    const files = await listFiles(req.params.resourceId, req.user.sub, req.user.role);
    res.json({ files });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// POST /api/resources/:resourceId/files — upload file(s) (admin or owner)
router.post(
  "/api/resources/:resourceId/files",
  authenticate,
  uploadResource.array("files"),
  async (req: Request<{ resourceId: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

      const uploaded = (req.files as Express.Multer.File[]) || [];
      if (uploaded.length === 0) {
        res.status(400).json({ error: "لم يتم اختيار ملف" });
        return;
      }

      const files = await addFiles(
        req.params.resourceId,
        req.user.sub,
        req.user.role,
        uploaded.map((f) => ({
          originalname: f.originalname,
          filename: f.filename,
          size: f.size,
          mimetype: f.mimetype,
        })),
      );
      res.status(201).json({ files });
    } catch (err) {
      handleResourceError(err, res);
    }
  },
);

// GET /api/resources/:resourceId/files/:fileId/download — download a file (any authenticated user)
router.get(
  "/api/resources/:resourceId/files/:fileId/download",
  authenticate,
  async (req: Request<{ resourceId: string; fileId: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
      const file = await getDownloadableFile(
        req.params.resourceId,
        req.params.fileId,
        req.user.sub,
        req.user.role,
      );
      const filePath = path.join(UPLOADS_DIR, path.basename(file.storagePath));
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "الملف غير موجود" });
        return;
      }
      res.download(filePath, file.name);
    } catch (err) {
      handleResourceError(err, res);
    }
  },
);

// DELETE /api/resources/:resourceId/files/:fileId — delete a file (admin or owner)
router.delete(
  "/api/resources/:resourceId/files/:fileId",
  authenticate,
  async (req: Request<{ resourceId: string; fileId: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

      await deleteResourceFile(
        req.params.resourceId,
        req.params.fileId,
        req.user.sub,
        req.user.role,
      );
      res.json({ message: "تم حذف الملف بنجاح" });
    } catch (err) {
      handleResourceError(err, res);
    }
  },
);

// POST /api/resources/:resourceId/notes — add a note (admin or owner)
router.post("/api/resources/:resourceId/notes", authenticate, async (req: Request<{ resourceId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const parsed = addNoteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const note = await addNote(req.params.resourceId, req.user.sub, req.user.role, parsed.data);
    res.status(201).json({ note });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// DELETE /api/resources/:resourceId/notes/:noteId — delete a note (admin or owner)
router.delete(
  "/api/resources/:resourceId/notes/:noteId",
  authenticate,
  async (req: Request<{ resourceId: string; noteId: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

      await deleteResourceNote(req.params.resourceId, req.params.noteId, req.user.sub, req.user.role);
      res.json({ message: "تم حذف الملاحظة بنجاح" });
    } catch (err) {
      handleResourceError(err, res);
    }
  },
);

// POST /api/resources/:resourceId/links — add a link (admin or owner)
router.post("/api/resources/:resourceId/links", authenticate, async (req: Request<{ resourceId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const parsed = addLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const link = await addLink(req.params.resourceId, req.user.sub, req.user.role, parsed.data);
    res.status(201).json({ link });
  } catch (err) {
    handleResourceError(err, res);
  }
});

// DELETE /api/resources/:resourceId/links/:linkId — delete a link (admin or owner)
router.delete(
  "/api/resources/:resourceId/links/:linkId",
  authenticate,
  async (req: Request<{ resourceId: string; linkId: string }>, res: Response) => {
    try {
      if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

      await deleteResourceLink(req.params.resourceId, req.params.linkId, req.user.sub, req.user.role);
      res.json({ message: "تم حذف الرابط بنجاح" });
    } catch (err) {
      handleResourceError(err, res);
    }
  },
);

export default router;
