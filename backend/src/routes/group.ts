import { Router, Request, Response } from "express";
import fs from "fs";
import {
  createGroupSchema,
  joinGroupSchema,
  updateMemberRoleSchema,
  updateGroupSchema,
  createGroup,
  joinGroup,
  listUserGroups,
  getGroupDetails,
  leaveGroup,
  deleteGroup,
  removeMember,
  updateMemberRole,
  updateGroup,
  GroupError,
} from "../services/group.service";
import { authenticate } from "../middleware/auth";
import { uploadAvatar } from "../middleware/uploadAvatar";
import { diskPathFromPublicUrl } from "../lib/uploads";
import { persistStoredImage, deleteStoredImageByUrl } from "../services/imageStore.service";
import { broadcastGroupUpdate } from "../services/presence.service";

const router = Router();

function handleGroupError(err: unknown, res: Response): void {
  if (err instanceof GroupError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error("Group error:", err);
  res.status(500).json({ error: "حدث خطأ في الخادم" });
}

/** Remove a public upload from the local disk (best effort; the durable copy
 *  is handled separately by removeImageEverywhere). */
function deleteFileIfExists(imageUrl: string | null | undefined) {
  const full = diskPathFromPublicUrl(imageUrl);
  if (!full) return;
  try { fs.unlinkSync(full); } catch { /* ignore */ }
}

/** Delete both the disk copy and the durable PostgreSQL copy of a public image. */
async function removeImageEverywhere(imageUrl: string | null | undefined) {
  deleteFileIfExists(imageUrl);
  await deleteStoredImageByUrl(imageUrl);
}

/** Durably persist a freshly written upload; on failure clean up the disk file
 *  so callers never keep a dangling reference. Returns the public URL. */
async function persistUpload(file: Express.Multer.File): Promise<string> {
  const imageUrl = `/uploads/${file.filename}`;
  try {
    await persistStoredImage(file.filename, file.mimetype);
  } catch (err) {
    deleteFileIfExists(imageUrl);
    throw err;
  }
  return imageUrl;
}

// POST /api/groups — create a new group
router.post("/api/groups", authenticate, uploadAvatar.single("image"), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const body = { ...req.body };
    const uploadUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    if (uploadUrl) {
      body.imageUrl = uploadUrl;
    }

    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      if (uploadUrl) deleteFileIfExists(uploadUrl);
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    // Mirror the bytes durably only after the payload validated, so a rejected
    // request never leaves an orphaned image row behind.
    if (req.file) await persistUpload(req.file);

    const group = await createGroup(req.user.sub, req.user.role, parsed.data);
    res.status(201).json({ group });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// POST /api/groups/join — join a group by code
router.post("/api/groups/join", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const parsed = joinGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    const group = await joinGroup(req.user.sub, req.user.role, parsed.data.joinCode);
    res.json({ group });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// GET /api/groups — list groups the user belongs to
router.get("/api/groups", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const groups = await listUserGroups(req.user.sub, req.user.role);
    res.json({ groups });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// GET /api/groups/:groupId — get group details
router.get("/api/groups/:groupId", authenticate, async (req: Request<{ groupId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const details = await getGroupDetails(req.params.groupId, req.user.sub, req.user.role);
    res.json({ group: details });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// POST /api/groups/:groupId/leave — leave a group
router.post("/api/groups/:groupId/leave", authenticate, async (req: Request<{ groupId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    await leaveGroup(req.params.groupId, req.user.sub);
    res.json({ message: "تمت المغادرة بنجاح" });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// DELETE /api/groups/:groupId — delete a group (owner only)
router.delete("/api/groups/:groupId", authenticate, async (req: Request<{ groupId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const { default: prisma } = await import("../lib/prisma");
    const group = await prisma.group.findUnique({ where: { id: req.params.groupId }, select: { imageUrl: true } });

    await deleteGroup(req.params.groupId, req.user.sub, req.user.role);

    // Delete group image (disk + durable copy) after the row is gone.
    if (group?.imageUrl) await removeImageEverywhere(group.imageUrl);

    res.json({ message: "تم حذف المجموعة بنجاح" });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// DELETE /api/groups/:groupId/members/:memberId — remove a member
router.delete("/api/groups/:groupId/members/:memberId", authenticate, async (req: Request<{ groupId: string; memberId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    await removeMember(req.params.groupId, req.params.memberId, req.user.sub, req.user.role);
    res.json({ message: "تمت إزالة العضو بنجاح" });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// PATCH /api/groups/:groupId/members/:memberId/role — update a member's role
router.patch("/api/groups/:groupId/members/:memberId/role", authenticate, async (req: Request<{ groupId: string; memberId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    await updateMemberRole(req.params.groupId, req.params.memberId, parsed.data.role, req.user.sub, req.user.role);
    res.json({ message: "تم تحديث الدور بنجاح" });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// PATCH /api/groups/:groupId — update group details (owner or admin)
router.patch("/api/groups/:groupId", authenticate, uploadAvatar.single("image"), async (req: Request<{ groupId: string }>, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const { default: prisma } = await import("../lib/prisma");
    const oldGroup = await prisma.group.findUnique({ where: { id: req.params.groupId }, select: { imageUrl: true } });

    const body = { ...req.body };
    const uploadUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    if (uploadUrl) {
      body.imageUrl = uploadUrl;
    }
    if (body.removeImage === "true") {
      body.imageUrl = null;
    }
    delete body.removeImage;

    const parsed = updateGroupSchema.safeParse(body);
    if (!parsed.success) {
      if (uploadUrl) deleteFileIfExists(uploadUrl);
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }

    // Mirror new bytes durably *before* committing the DB update, so the group
    // never references an image that only exists on the ephemeral disk. On
    // failure the request aborts and the previous avatar stays intact.
    if (req.file) await persistUpload(req.file);

    const group = await updateGroup(req.params.groupId, req.user.sub, req.user.role, parsed.data);

    // Delete the previous image (disk + durable copy) only after the row now
    // references the replacement/removal — never on a failed update.
    if (oldGroup?.imageUrl && body.imageUrl !== undefined && oldGroup.imageUrl !== body.imageUrl) {
      await removeImageEverywhere(oldGroup.imageUrl);
    }

    // Propagate the change to every authorized member so open views converge.
    void broadcastGroupUpdate(req.params.groupId, group).catch(() => {});

    res.json({ group });
  } catch (err) {
    handleGroupError(err, res);
  }
});

// POST /api/profile/avatar — upload or replace profile avatar
router.post("/api/profile/avatar", authenticate, uploadAvatar.single("avatar"), async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }
    if (!req.file) { res.status(400).json({ error: "لم يتم اختيار ملف" }); return; }

    const { default: prisma } = await import("../lib/prisma");

    const existing = await prisma.profile.findUnique({ where: { userId: req.user.sub }, select: { avatarUrl: true } });

    // Store the new avatar durably first; only then commit the DB row and drop
    // the previous one. A failed upload therefore never destroys the current
    // avatar (previously the old file was deleted before the new row was saved).
    const avatarUrl = await persistUpload(req.file);
    await prisma.profile.upsert({
      where: { userId: req.user.sub },
      update: { avatarUrl },
      create: { userId: req.user.sub, avatarUrl },
    });

    if (existing?.avatarUrl && existing.avatarUrl !== avatarUrl) {
      await removeImageEverywhere(existing.avatarUrl);
    }

    res.json({ avatarUrl });
  } catch (err) {
    console.error("Avatar upload error:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// DELETE /api/profile/avatar — remove profile avatar
router.delete("/api/profile/avatar", authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user) { res.status(401).json({ error: "غير مصرح" }); return; }

    const { default: prisma } = await import("../lib/prisma");

    const existing = await prisma.profile.findUnique({ where: { userId: req.user.sub }, select: { avatarUrl: true } });

    // Clear the reference first so a failed cleanup can never leave the profile
    // pointing at a deleted file.
    await prisma.profile.upsert({
      where: { userId: req.user.sub },
      update: { avatarUrl: null },
      create: { userId: req.user.sub, avatarUrl: null },
    });

    if (existing?.avatarUrl) await removeImageEverywhere(existing.avatarUrl);

    res.json({ message: "تم حذف الصورة" });
  } catch (err) {
    console.error("Avatar delete error:", err);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

export default router;
