import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import prisma from "../lib/prisma";
import { isAdminRole } from "../lib/roles";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const resourceTypeLiteral = z.enum(["FILE", "NOTE", "LINK"], { message: "النوع غير صالح" });

export const createResourceSchema = z.object({
  title: z.string().min(1, "اسم المادة مطلوب").max(200, "اسم المادة طويل جداً").trim(),
  description: z.string().max(1000, "الوصف طويل جداً").trim().optional(),
  type: resourceTypeLiteral,
  isPrivate: z.boolean().optional(),
});

export const updateResourceSchema = z.object({
  title: z.string().min(1, "اسم المادة مطلوب").max(200, "اسم المادة طويل جداً").trim().optional(),
  description: z.string().max(1000, "الوصف طويل جداً").trim().nullable().optional(),
  type: resourceTypeLiteral.optional(),
  isPrivate: z.boolean().optional(),
});

export const addNoteSchema = z.object({
  title: z.string().min(1, "عنوان الملاحظة مطلوب").max(200, "العنوان طويل جداً").trim(),
  content: z.string().max(10000, "المحتوى طويل جداً").optional(),
});

export const addLinkSchema = z.object({
  title: z.string().min(1, "اسم الرابط مطلوب").max(200, "الاسم طويل جداً").trim(),
  url: z.string().min(1, "عنوان الرابط مطلوب").max(2000, "الرابط طويل جداً").trim(),
});

export const accessPrivateResourceSchema = z.object({
  code: z
    .string()
    .length(6, "رمز الوصول يجب أن يكون 6 أرقام")
    .regex(/^\d{6}$/, "رمز الوصول يجب أن يكون أرقام فقط"),
});

const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads", "resources");

function absolutePath(filename: string): string {
  return path.join(UPLOADS_DIR, path.basename(filename));
}

// ---------------------------------------------------------------------------
// Access codes (private resources)
// ---------------------------------------------------------------------------
// A private resource gets a random, non-sequential 6-digit numeric access code.
// The code is NEVER stored in plain text:
//  - `accessCodeHash` (SHA-256, unique) — guarantees no two active private
//    resources share a code and enables constant-time validation.
//  - `accessCodeCiphertext` (AES-256-GCM, random IV, keyed by server secret) —
//    lets the resource owner view/copy their code again later; only the owner
//    or a system admin ever receives the decrypted plaintext.

function generateAccessCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function hashAccessCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function accessCodeKey(): Buffer {
  const secret =
    process.env.JWT_SECRET || "morven-resource-access-key";
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptAccessCode(code: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", accessCodeKey(), iv);
  const enc = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

function decryptAccessCode(payload: string): string {
  const [iv, tag, enc] = payload.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", accessCodeKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
}

function validateAccessCode(code: string, resource: { accessCodeHash: string | null }): boolean {
  if (!resource.accessCodeHash) return false;
  const actual = Buffer.from(hashAccessCode(code), "hex");
  const expected = Buffer.from(resource.accessCodeHash, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/** Generates a unique access code, retrying on collisions (like Groups). */
async function ensureUniqueAccessCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateAccessCode();
    const existing = await prisma.resource.findUnique({
      where: { accessCodeHash: hashAccessCode(code) },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new ResourceError("تعذر إنشاء رمز فريد", 500);
}

function tryDecrypt(payload: string | null): string | null {
  if (!payload) return null;
  try {
    return decryptAccessCode(payload);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * Admin has full control over any Resource. A Resource Owner has full control
 * over their own Resource. A regular Member is view-only.
 */
function canEdit(role: string, ownerId: string, userId: string): boolean {
  return isAdminRole(role) || ownerId === userId;
}

/**
 * Whether a requester may VIEW a resource (read details/files/downloads).
 * Public resources are open to every authenticated user. Private resources are
 * only visible to: the owner, a system ADMIN, and users who have unlocked the
 * resource with the correct 6-digit access code (`ResourceAccess` record).
 */
async function canAccessPrivate(
  resource: { id: string; isPrivate: boolean; ownerId: string },
  requesterId: string,
  role: string,
): Promise<boolean> {
  if (!resource.isPrivate) return true;
  if (isAdminRole(role) || resource.ownerId === requesterId) return true;
  const granted = await prisma.resourceAccess.findUnique({
    where: { resourceId_userId: { resourceId: resource.id, userId: requesterId } },
    select: { id: true },
  });
  return granted != null;
}

async function assertCanViewResource(resourceId: string, requesterId: string, role: string) {
  const resource = await getResourceOrThrow(resourceId);
  if (!(await canAccessPrivate(resource, requesterId, role))) {
    throw new ResourceError("غير مصرح", 403);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ResourceWithContent = Prisma.ResourceGetPayload<{
  include: {
    owner: { select: { id: true; displayName: true } };
    files: true;
    notes: true;
    links: true;
  };
}>;

type ResourceBase = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  ownerId: string;
  isPrivate: boolean;
  accessCodeCiphertext: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner?: { id: string; displayName: string };
};

type SanitizeOptions = {
  /** Include `accessCode` in the response (owner/admin context only). */
  includeCode?: boolean;
  /** The decoded plaintext access code (owner/admin context only). */
  accessCode?: string | null;
};

function toType(value: string): "file" | "note" | "link" {
  return value.toLowerCase() as "file" | "note" | "link";
}

function sanitizeResourceBase(r: ResourceBase, opts: SanitizeOptions = {}) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    type: toType(r.type),
    ownerId: r.ownerId,
    uploadedBy: r.owner?.displayName ?? "مستخدم",
    uploadedAt: r.createdAt.toISOString().split("T")[0],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    isPrivate: r.isPrivate,
    ...(opts.includeCode && r.isPrivate ? { accessCode: opts.accessCode ?? null } : {}),
  };
}

function sanitizeContent(r: ResourceWithContent, opts: SanitizeOptions = {}) {
  return {
    ...sanitizeResourceBase(r, opts),
    files: r.files.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.mimeType,
      size: f.size,
      createdAt: f.createdAt.getTime(),
    })),
    notes: r.notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content || "",
      createdAt: n.createdAt.getTime(),
    })),
    links: r.links.map((l) => ({
      id: l.id,
      title: l.title,
      url: l.url,
      createdAt: l.createdAt.getTime(),
    })),
  };
}

async function getResourceOrThrow(resourceId: string) {
  const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
  if (!resource) {
    throw new ResourceError("المورد غير موجود", 404);
  }
  return resource;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listResources(requesterId: string, role: string) {
  // A system ADMIN/SUB_ADMIN sees every resource (consistent with groups).
  // Everyone else sees public resources plus private resources they own or
  // have unlocked.
  const admin = isAdminRole(role);
  const where = admin
    ? {}
    : {
        OR: [
          { isPrivate: false },
          { ownerId: requesterId },
          { access: { some: { userId: requesterId } } },
        ],
      };

  const resources = await prisma.resource.findMany({
    where,
    include: { owner: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return resources.map((r) => sanitizeResourceBase(r, { includeCode: false }));
}

export async function createResource(ownerId: string, input: z.infer<typeof createResourceSchema>) {
  let isPrivate = input.isPrivate ?? false;
  let accessCode: string | null = null;
  const data: Prisma.ResourceUncheckedCreateInput = {
    title: input.title,
    description: input.description || null,
    type: input.type,
    ownerId,
    isPrivate,
  };

  if (isPrivate) {
    accessCode = await ensureUniqueAccessCode();
    data.accessCodeHash = hashAccessCode(accessCode);
    data.accessCodeCiphertext = encryptAccessCode(accessCode);
  }

  const resource = await prisma.resource.create({
    data,
    include: { owner: { select: { id: true, displayName: true } } },
  });
  return sanitizeResourceBase(resource, { includeCode: true, accessCode });
}

export async function getResourceDetails(resourceId: string, requesterId: string, role: string) {
  const resource = await prisma.resource.findUnique({
    where: { id: resourceId },
    include: {
      owner: { select: { id: true, displayName: true } },
      files: true,
      notes: true,
      links: true,
    },
  });
  if (!resource) {
    throw new ResourceError("المورد غير موجود", 404);
  }

  if (!(await canAccessPrivate(resource, requesterId, role))) {
    throw new ResourceError("هذا المورد خاص", 403, "PRIVATE_RESOURCE");
  }

  const includeCode = resource.isPrivate && (isAdminRole(role) || resource.ownerId === requesterId);
  return sanitizeContent(resource, {
    includeCode,
    accessCode: includeCode ? tryDecrypt(resource.accessCodeCiphertext) : null,
  });
}

export async function updateResource(
  resourceId: string,
  requesterId: string,
  role: string,
  input: z.infer<typeof updateResourceSchema>,
) {
  const resource = await getResourceOrThrow(resourceId);

  if (!canEdit(role, resource.ownerId, requesterId)) {
    throw new ResourceError("ليس لديك صلاحية لتعديل هذا المورد", 403);
  }

  const data: Prisma.ResourceUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.type !== undefined) data.type = input.type;

  // Visibility transitions: going private mint a fresh unique code; going
  // public discards the code (and any existing unlocks become irrelevant).
  if (input.isPrivate !== undefined && input.isPrivate !== resource.isPrivate) {
    data.isPrivate = input.isPrivate;
    if (input.isPrivate) {
      const accessCode = await ensureUniqueAccessCode();
      data.accessCodeHash = hashAccessCode(accessCode);
      data.accessCodeCiphertext = encryptAccessCode(accessCode);
    } else {
      data.accessCodeHash = null;
      data.accessCodeCiphertext = null;
    }
  }

  const updated = await prisma.resource.update({
    where: { id: resourceId },
    data,
    include: { owner: { select: { id: true, displayName: true } } },
  });

  // The caller is the owner/admin (enforced above), so revealing the code is safe.
  return sanitizeResourceBase(updated, {
    includeCode: updated.isPrivate,
    accessCode: updated.isPrivate ? tryDecrypt(updated.accessCodeCiphertext) : null,
  });
}

export async function deleteResource(resourceId: string, requesterId: string, role: string) {
  const resource = await getResourceOrThrow(resourceId);

  if (!canEdit(role, resource.ownerId, requesterId)) {
    throw new ResourceError("ليس لديك صلاحية لحذف هذا المورد", 403);
  }

  const files = await prisma.resourceFile.findMany({ where: { resourceId } });

  await prisma.resource.delete({ where: { id: resourceId } });

  // Clean up stored files from disk (best-effort).
  for (const file of files) {
    try { fs.unlinkSync(absolutePath(file.storagePath)); } catch { /* ignore */ }
  }
}

/** Unlocks a private resource after proving ownership of its 6-digit code. */
export async function accessPrivateResource(
  resourceId: string,
  requesterId: string,
  role: string,
  code: string,
) {
  const resource = await getResourceOrThrow(resourceId);

  if (!resource.isPrivate) {
    throw new ResourceError("هذا المورد عام", 400);
  }

  if (isAdminRole(role) || resource.ownerId === requesterId) {
    return getResourceDetails(resourceId, requesterId, role);
  }

  if (!validateAccessCode(code, resource)) {
    throw new ResourceError("رمز الوصول غير صحيح", 403);
  }

  await prisma.resourceAccess.upsert({
    where: { resourceId_userId: { resourceId, userId: requesterId } },
    create: { resourceId, userId: requesterId },
    update: {},
  });

  return getResourceDetails(resourceId, requesterId, role);
}

/**
 * Adds a private resource to the requester's list using ONLY its 6-digit code
 * (no resource ID needed). Grants access in one step and returns the content.
 */
export async function accessPrivateResourceByCode(requesterId: string, role: string, code: string) {
  const resource = await prisma.resource.findUnique({
    where: { accessCodeHash: hashAccessCode(code) },
    include: {
      owner: { select: { id: true, displayName: true } },
      files: true,
      notes: true,
      links: true,
    },
  });
  if (!resource || !resource.isPrivate) {
    throw new ResourceError("رمز الوصول غير صحيح", 404);
  }

  const canManage = isAdminRole(role) || resource.ownerId === requesterId;
  if (!canManage) {
    await prisma.resourceAccess.upsert({
      where: { resourceId_userId: { resourceId: resource.id, userId: requesterId } },
      create: { resourceId: resource.id, userId: requesterId },
      update: {},
    });
  }

  return sanitizeContent(resource, {
    includeCode: canManage,
    accessCode: canManage ? tryDecrypt(resource.accessCodeCiphertext) : null,
  });
}

// ---------------------------------------------------------------------------
// Resource: owner/admin only mutations (enforced by canEdit)
// ---------------------------------------------------------------------------

async function assertCanEditResource(resourceId: string, requesterId: string, role: string) {
  const resource = await getResourceOrThrow(resourceId);
  if (!canEdit(role, resource.ownerId, requesterId)) {
    throw new ResourceError("ليس لديك صلاحية", 403);
  }
  return resource;
}

export async function addFiles(
  resourceId: string,
  requesterId: string,
  role: string,
  files: { originalname: string; filename: string; size: number; mimetype: string }[],
) {
  await assertCanEditResource(resourceId, requesterId, role);

  // Enforce a maximum of 10 files per resource (mirrors the frontend limit).
  const allowedRemaining = 10 - (await prisma.resourceFile.count({ where: { resourceId } }));
  const toCreate = files.slice(0, allowedRemaining);

  const created = [];
  for (const file of toCreate) {
    const record = await prisma.resourceFile.create({
      data: {
        resourceId,
        name: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storagePath: file.filename,
      },
    });
    created.push({
      id: record.id,
      name: record.name,
      type: record.mimeType,
      size: record.size,
      createdAt: record.createdAt.getTime(),
    });
  }

  // Remove any files that exceeded the limit from disk.
  for (const file of files.slice(allowedRemaining)) {
    try { fs.unlinkSync(absolutePath(file.filename)); } catch { /* ignore */ }
  }

  return created;
}

export async function listFiles(resourceId: string, requesterId: string, role: string) {
  await assertCanViewResource(resourceId, requesterId, role);

  const files = await prisma.resourceFile.findMany({
    where: { resourceId },
    orderBy: { createdAt: "desc" },
  });
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.mimeType,
    size: f.size,
    createdAt: f.createdAt.getTime(),
  }));
}

export async function getDownloadableFile(resourceId: string, fileId: string, requesterId: string, role: string) {
  await assertCanViewResource(resourceId, requesterId, role);

  const file = await prisma.resourceFile.findFirst({ where: { id: fileId, resourceId } });
  if (!file) {
    throw new ResourceError("الملف غير موجود", 404);
  }
  return file;
}

export async function deleteResourceFile(resourceId: string, fileId: string, requesterId: string, role: string) {
  await assertCanEditResource(resourceId, requesterId, role);

  const file = await prisma.resourceFile.findFirst({ where: { id: fileId, resourceId } });
  if (!file) {
    throw new ResourceError("الملف غير موجود", 404);
  }

  await prisma.resourceFile.delete({ where: { id: fileId } });
  try { fs.unlinkSync(absolutePath(file.storagePath)); } catch { /* ignore */ }
}

export async function addNote(
  resourceId: string,
  requesterId: string,
  role: string,
  input: z.infer<typeof addNoteSchema>,
) {
  await assertCanEditResource(resourceId, requesterId, role);

  const note = await prisma.resourceNote.create({
    data: { resourceId, title: input.title, content: input.content || "" },
  });
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt.getTime(),
  };
}

export async function deleteResourceNote(resourceId: string, noteId: string, requesterId: string, role: string) {
  await assertCanEditResource(resourceId, requesterId, role);

  const note = await prisma.resourceNote.findFirst({ where: { id: noteId, resourceId } });
  if (!note) {
    throw new ResourceError("الملاحظة غير موجودة", 404);
  }
  await prisma.resourceNote.delete({ where: { id: noteId } });
}

export async function addLink(
  resourceId: string,
  requesterId: string,
  role: string,
  input: z.infer<typeof addLinkSchema>,
) {
  await assertCanEditResource(resourceId, requesterId, role);

  const link = await prisma.resourceLink.create({
    data: { resourceId, title: input.title, url: input.url },
  });
  return {
    id: link.id,
    title: link.title,
    url: link.url,
    createdAt: link.createdAt.getTime(),
  };
}

export async function deleteResourceLink(resourceId: string, linkId: string, requesterId: string, role: string) {
  await assertCanEditResource(resourceId, requesterId, role);

  const link = await prisma.resourceLink.findFirst({ where: { id: linkId, resourceId } });
  if (!link) {
    throw new ResourceError("الرابط غير موجود", 404);
  }
  await prisma.resourceLink.delete({ where: { id: linkId } });
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ResourceError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ResourceError";
    this.status = status;
    this.code = code;
  }
}