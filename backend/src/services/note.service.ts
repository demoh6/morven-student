import { z } from "zod";
import prisma from "../lib/prisma";
import { UserDataError } from "./userDataError";
import { createWithClientId } from "./createWithClientId";

// ---------------------------------------------------------------------------
// Validation schemas
//
// One Note table covers BOTH the general notes store ("morven-notes") and the
// medical notes store ("morven-medical-notes") via the `type` discriminator
// from Phase 1. The medical flow additionally carries a free-text `category`.
// ---------------------------------------------------------------------------

const noteTypeValue = z.enum(["general", "medical"]);

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, "عنوان الملاحظة مطلوب").max(500, "العنوان طويل جداً"),
  content: z.string().max(50000, "المحتوى طويل جداً"),
  pinned: z.boolean().optional(),
  type: noteTypeValue.optional(),
  category: z.string().trim().max(100, "الفئة طويلة جداً").nullable().optional(),
  // Stable client-generated id used for idempotent guest→account migration.
  clientId: z.string().trim().min(1, "معرّف العميل مطلوب").max(64, "معرّف العميل طويل جداً").optional(),
});

export const updateNoteSchema = createNoteSchema.partial();

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

const NOTE_TYPE_MAP = {
  general: "GENERAL",
  medical: "MEDICAL",
} as const;

type PrismaNote = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  type: string;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Serialise a DB note into the frontend Note / MedicalNote shape. */
export function serializeNote(note: PrismaNote) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    pinned: note.pinned,
    type: note.type.toLowerCase() as "general" | "medical",
    category: note.category ?? undefined,
    createdAt: note.createdAt.getTime(),
    updatedAt: note.updatedAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * List the current user's notes, newest first. The optional `type` query
 * filter ('general' | 'medical') maps to the two existing local stores.
 */
export async function listMyNotes(
  userId: string,
  type?: "general" | "medical"
) {
  const notes = await prisma.note.findMany({
    where: {
      userId,
      ...(type ? { type: NOTE_TYPE_MAP[type] } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return notes.map(serializeNote);
}

/** Create a note owned by the authenticated user (idempotent via clientId). */
export async function createMyNote(userId: string, input: CreateNoteInput) {
  const type = input.type ?? "general";
  if (type === "medical" && !input.category) {
    throw new UserDataError("فئة الملاحظة الطبية مطلوبة", 400);
  }

  return createWithClientId(
    (clientId) =>
      prisma.note
        .findFirst({ where: { userId, clientId } })
        .then((n) => (n ? serializeNote(n) : null)),
    async () => {
      const note = await prisma.note.create({
        data: {
          userId,
          title: input.title,
          content: input.content,
          pinned: input.pinned ?? false,
          type: NOTE_TYPE_MAP[type],
          category: input.category ?? null,
          clientId: input.clientId ?? null,
        },
      });
      return serializeNote(note);
    },
    input.clientId
  );
}

/** Update one of the current user's notes (ownership-scoped). */
export async function updateMyNote(
  userId: string,
  noteId: string,
  input: UpdateNoteInput
) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) data.content = input.content;
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (input.type !== undefined) {
    const type = input.type;
    if (type === "medical" && input.category === undefined) {
      // Keep existing category if the note is already medical; category is
      // still enforced at create-time.
      data.type = NOTE_TYPE_MAP[type];
    } else {
      if (type === "medical" && !input.category) {
        throw new UserDataError("فئة الملاحظة الطبية مطلوبة", 400);
      }
      data.type = NOTE_TYPE_MAP[type];
    }
  }
  if (input.category !== undefined) data.category = input.category ?? null;

  const result = await prisma.note.updateMany({
    where: { id: noteId, userId },
    data,
  });
  if (result.count === 0) {
    throw new UserDataError("الملاحظة غير موجودة", 404);
  }

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  return serializeNote(note!);
}

/** Delete one of the current user's notes (ownership-scoped). */
export async function deleteMyNote(userId: string, noteId: string) {
  const result = await prisma.note.deleteMany({
    where: { id: noteId, userId },
  });
  if (result.count === 0) {
    throw new UserDataError("الملاحظة غير موجودة", 404);
  }
}