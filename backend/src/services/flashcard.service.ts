import { z } from "zod";
import prisma from "../lib/prisma";
import { UserDataError } from "./userDataError";
import { createWithClientId } from "./createWithClientId";

// ---------------------------------------------------------------------------
// Validation schemas
//
// Mirrors the frontend Flashcard shape (src/types/index.ts) and its values:
//   difficulty -> 'easy' | 'medium' | 'hard'
//   nextReview -> epoch-ms number (0 = not scheduled) — stored as DateTime
// The `type` discriminator preserves the GENERAL vs MEDICAL bucket distinction
// made in Phase 1; there is deliberately no separate medical endpoint.
// ---------------------------------------------------------------------------

const difficultyValue = z.enum(["easy", "medium", "hard"]);

const flashcardTypeValue = z.enum(["general", "medical"]);

export const createFlashcardSchema = z.object({
  front: z.string().trim().min(1, "وجه البطاقة مطلوب").max(1000, "النص طويل جداً"),
  back: z.string().trim().min(1, "ظهر البطاقة مطلوب").max(5000, "النص طويل جداً"),
  deck: z.string().trim().min(1, "اسم الحزمة مطلوب").max(100, "اسم الحزمة طويل جداً"),
  type: flashcardTypeValue.optional(),
  difficulty: difficultyValue.optional(),
  nextReview: z.number().int().min(0).nullable().optional(),
  reviewCount: z.number().int().min(0).optional(),
  // Stable client-generated id used for idempotent guest→account migration.
  clientId: z.string().trim().min(1, "معرّف العميل مطلوب").max(64, "معرّف العميل طويل جداً").optional(),
});

export const updateFlashcardSchema = createFlashcardSchema.partial();

export type CreateFlashcardInput = z.infer<typeof createFlashcardSchema>;
export type UpdateFlashcardInput = z.infer<typeof updateFlashcardSchema>;

const DIFFICULTY_MAP = {
  easy: "EASY",
  medium: "MEDIUM",
  hard: "HARD",
} as const;

const FLASHCARD_TYPE_MAP = {
  general: "GENERAL",
  medical: "MEDICAL",
} as const;

type PrismaFlashcard = {
  id: string;
  front: string;
  back: string;
  deck: string;
  type: string;
  difficulty: string;
  nextReview: Date | null;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Serialise a DB flashcard into the frontend Flashcard shape. */
export function serializeFlashcard(flashcard: PrismaFlashcard) {
  return {
    id: flashcard.id,
    front: flashcard.front,
    back: flashcard.back,
    deck: flashcard.deck,
    type: flashcard.type.toLowerCase() as "general" | "medical",
    difficulty: flashcard.difficulty.toLowerCase() as "easy" | "medium" | "hard",
    nextReview: flashcard.nextReview ? flashcard.nextReview.getTime() : 0,
    reviewCount: flashcard.reviewCount,
    createdAt: flashcard.createdAt.getTime(),
    updatedAt: flashcard.updatedAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * List the current user's flashcards, newest first. The optional `type`
 * query filter ('general' | 'medical') lets the frontend keep the two
 * buckets separate without a second API.
 */
export async function listMyFlashcards(
  userId: string,
  type?: "general" | "medical"
) {
  const flashcards = await prisma.flashcard.findMany({
    where: {
      userId,
      ...(type ? { type: FLASHCARD_TYPE_MAP[type] } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return flashcards.map(serializeFlashcard);
}

/** Create a flashcard owned by the authenticated user (idempotent via clientId). */
export async function createMyFlashcard(
  userId: string,
  input: CreateFlashcardInput
) {
  return createWithClientId(
    (clientId) =>
      prisma.flashcard
        .findFirst({ where: { userId, clientId } })
        .then((f) => (f ? serializeFlashcard(f) : null)),
    async () => {
      const flashcard = await prisma.flashcard.create({
        data: {
          userId,
          front: input.front,
          back: input.back,
          deck: input.deck,
          type: input.type ? FLASHCARD_TYPE_MAP[input.type] : "GENERAL",
          difficulty: input.difficulty ? DIFFICULTY_MAP[input.difficulty] : "MEDIUM",
          nextReview: input.nextReview ? new Date(input.nextReview) : null,
          reviewCount: input.reviewCount ?? 0,
          clientId: input.clientId ?? null,
        },
      });
      return serializeFlashcard(flashcard);
    },
    input.clientId
  );
}

/** Update one of the current user's flashcards (ownership-scoped). */
export async function updateMyFlashcard(
  userId: string,
  flashcardId: string,
  input: UpdateFlashcardInput
) {
  const data: Record<string, unknown> = {};
  if (input.front !== undefined) data.front = input.front;
  if (input.back !== undefined) data.back = input.back;
  if (input.deck !== undefined) data.deck = input.deck;
  if (input.type !== undefined) data.type = FLASHCARD_TYPE_MAP[input.type];
  if (input.difficulty !== undefined) data.difficulty = DIFFICULTY_MAP[input.difficulty];
  if (input.nextReview !== undefined) data.nextReview = input.nextReview ? new Date(input.nextReview) : null;
  if (input.reviewCount !== undefined) data.reviewCount = input.reviewCount;

  const result = await prisma.flashcard.updateMany({
    where: { id: flashcardId, userId },
    data,
  });
  if (result.count === 0) {
    throw new UserDataError("البطاقة غير موجودة", 404);
  }

  const flashcard = await prisma.flashcard.findUnique({
    where: { id: flashcardId },
  });
  return serializeFlashcard(flashcard!);
}

/** Delete one of the current user's flashcards (ownership-scoped). */
export async function deleteMyFlashcard(userId: string, flashcardId: string) {
  const result = await prisma.flashcard.deleteMany({
    where: { id: flashcardId, userId },
  });
  if (result.count === 0) {
    throw new UserDataError("البطاقة غير موجودة", 404);
  }
}