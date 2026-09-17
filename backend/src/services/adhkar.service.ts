import { z } from "zod";
import prisma from "../lib/prisma";

// The four Adhkar category ids match the frontend's bundled offline dataset
// (src/data/adhkar.ts). They are validated server-side so submissions can never
// be attached to an unknown category.
export const ADHKAR_CATEGORY_IDS = [
  "morning-evening",
  "before-study",
  "after-study",
  "before-exam",
] as const;
export type AdhkarCategoryId = (typeof ADHKAR_CATEGORY_IDS)[number];

const CATEGORY_TITLES: Record<AdhkarCategoryId, string> = {
  "morning-evening": "أذكار الصباح والمساء",
  "before-study": "أذكار قبل الدراسة",
  "after-study": "أذكار بعد الدراسة",
  "before-exam": "أذكار قبل الامتحانات",
};

export class AdhkarError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Shared validation for dhikr content (title/text/source) — used both when a
// user submits a proposal and when an admin edits a visible dhikr.
export const dhikrContentSchema = z.object({

  text: z
    .string()
    .trim()
    .min(1, { message: "يرجى إدخال محتوى الذكر" })
    .max(10000, { message: "محتوى الذكر طويل جداً" }),
  source: z
    .string()
    .trim()
    .max(500, { message: "المصدر طويل جداً" })
    .optional()
    .default(""),
});

export type DhikrContentInput = z.infer<typeof dhikrContentSchema>;

export const createDhikrSubmissionSchema = z.object({
  categoryId: z.enum(ADHKAR_CATEGORY_IDS, {
    message: "قسم الأذكار غير صالح",
  }),
  ...dhikrContentSchema.shape,
});

export type CreateDhikrSubmissionInput = z.infer<
  typeof createDhikrSubmissionSchema
>;

/**
 * Creates a new dhikr submission. It always starts as PENDING and is never
 * injected into the official/public adhkar content — that only happens once an
 * administrator approves it.
 */
export async function createDhikrSubmission(
  userId: string,
  input: CreateDhikrSubmissionInput
) {
  return prisma.dhikrSubmission.create({
    data: {
      userId,
      categoryId: input.categoryId,
      title: input.title,
      text: input.text,
      source: input.source,
      status: "PENDING",
    },
  });
}

/**
 * Returns every submission (of any status) with full submitter info, newest
 * first. ADMIN-only.
 */
export async function listDhikrSubmissions() {
  const submissions = await prisma.dhikrSubmission.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          profile: { select: { avatarUrl: true } },
        },
      },
    },
  });
  return submissions.map(({ user, ...submission }) => ({
    ...submission,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.profile?.avatarUrl ?? null,
    },
  }));
}

/**
 * Public list of APPROVED user-submitted dhikr, plus the admin mutations for
 * bundled official content (edits + tombstone deletions). PENDING and REJECTED
 * rows are never exposed here. Available to guests too (optionalAuth), so
 * approved content behaves like the bundled official adhkar (readable without
 * login) while PENDING/REJECTED stays invisible for everyone.
 */
export async function listApprovedAdhkar() {
  const [rows, edits, deletions] = await Promise.all([
    prisma.dhikrSubmission.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        categoryId: true,
        title: true,
        text: true,
        source: true,
        createdAt: true,
      },
    }),
    prisma.dhikrOfficialEdit.findMany({
      orderBy: { updatedAt: "asc" },
      select: {
        officialDhikrId: true,
        title: true,
        text: true,
        source: true,
      },
    }),
    prisma.dhikrOfficialDeletion.findMany({
      select: { officialDhikrId: true },
    }),
  ]);
  return {
    adhkar: rows.map((r) => ({
      ...r,
      // Stable appended ordering: approved content is sorted after the last
      // official dhikr by the frontend, and among themselves by approval time.
      approvedAt: r.createdAt,
    })),
    officialEdits: edits,
    officialDeletions: deletions.map((d) => d.officialDhikrId),
  };
}

/**
 * Approves a submission: flips it to APPROVED so it becomes part of the
 * visible/public adhkar content. Idempotent — an already-approved submission is
 * returned untouched so the same id can never be published twice.
 */
export async function approveDhikrSubmission(
  submissionId: string,
  adminId: string
) {
  const existing = await prisma.dhikrSubmission.findUnique({
    where: { id: submissionId },
  });
  if (!existing) {
    throw new AdhkarError("الطلب غير موجود", 404);
  }
  if (existing.status === "APPROVED") {
    return existing;
  }

  return prisma.dhikrSubmission.update({
    where: { id: submissionId },
    data: { status: "APPROVED" },
  });
}

/**
 * Rejects a submission and sends an in-app notification ONLY to the submitting
 * user. Idempotent: rejecting twice does not create a second notification.
 */
export async function rejectDhikrSubmission(
  submissionId: string,
  adminId: string
) {
  const existing = await prisma.dhikrSubmission.findUnique({
    where: { id: submissionId },
    include: { user: { select: { id: true } } },
  });
  if (!existing) {
    throw new AdhkarError("الطلب غير موجود", 404);
  }
  if (existing.status === "REJECTED") {
    return existing;
  }

  const categoryTitle =
    CATEGORY_TITLES[existing.categoryId as AdhkarCategoryId] ??
    existing.categoryId;

  return prisma.$transaction([
    prisma.dhikrSubmission.update({
      where: { id: submissionId },
      data: { status: "REJECTED" },
    }),
    prisma.appNotification.create({
      data: {
        title: "تم رفض الذكر المقترح",
        body: `تم رفض الذكر الذي اقترحته في قسم ${categoryTitle}.`,
        type: "info",
        createdBy: adminId,
        targetUserId: existing.userId,
      },
    }),
  ]).then(([updated]) => updated);
}

/**
 * Updates the content (title/text/source) of a user's submission in place.
 * ADMIN-only. Status is preserved — editing never re-approves or re-publishes
 * a PENDING/REJECTED submission.
 */
export async function updateDhikrSubmissionContent(
  submissionId: string,
  input: DhikrContentInput,
  adminId: string
) {
  const existing = await prisma.dhikrSubmission.findUnique({
    where: { id: submissionId },
  });
  if (!existing) {
    throw new AdhkarError("الطلب غير موجود", 404);
  }
  return prisma.dhikrSubmission.update({
    where: { id: submissionId },
    data: {
      title: input.title,
      text: input.text,
      source: input.source,
    },
  });
}

/**
 * Permanently removes a user's submission. ADMIN-only. Used to delete a card
 * that was previously approved and visible to everyone.
 */
export async function deleteDhikrSubmission(
  submissionId: string,
  adminId: string
) {
  const existing = await prisma.dhikrSubmission.findUnique({
    where: { id: submissionId },
  });
  if (!existing) {
    throw new AdhkarError("الطلب غير موجود", 404);
  }
  return prisma.dhikrSubmission.delete({ where: { id: submissionId } });
}

/**
 * Persists an admin edit of a bundled official dhikr. The bundled dataset
 * (frontend/src/data/adhkar.ts) stays untouched and remains the offline
 * fallback; this override is merged over it at render time. Idempotent:
 * re-editing the same official dhikr updates the existing override instead of
 * creating a duplicate.
 */
export async function saveOfficialDhikrEdit(
  officialDhikrId: string,
  input: DhikrContentInput,
  adminId: string
) {
  return prisma.dhikrOfficialEdit.upsert({
    where: { officialDhikrId },
    update: {
      title: input.title,
      text: input.text,
      source: input.source,
      editedBy: adminId,
    },
    create: {
      officialDhikrId,
      title: input.title,
      text: input.text,
      source: input.source,
      editedBy: adminId,
    },
  });
}

/**
 * Marks a bundled official dhikr as deleted (tombstone) so it stops rendering
 * for everyone. Idempotent: deleting twice does not create a second record.
 * Any override edit for the same dhikr is dropped too, so dead entries cannot
 * accumulate.
 */
export async function deleteOfficialDhikr(
  officialDhikrId: string,
  adminId: string
) {
  const existing = await prisma.dhikrOfficialDeletion.findUnique({
    where: { officialDhikrId },
  });
  if (existing) {
    return existing;
  }
  return prisma.$transaction([
    prisma.dhikrOfficialEdit.deleteMany({ where: { officialDhikrId } }),
    prisma.dhikrOfficialDeletion.create({
      data: { officialDhikrId, deletedBy: adminId },
    }),
  ]).then(([, deletion]) => deletion);
}