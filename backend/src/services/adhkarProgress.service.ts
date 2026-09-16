import { z } from "zod";
import prisma from "../lib/prisma";
import { UserDataError } from "./userDataError";

// ---------------------------------------------------------------------------
// Validation schemas
//
// One progress record per user/day (unique constraint from Phase 1). `day`
// is the frontend's local calendar date ('YYYY-MM-DD'); `counts` is the
// dhikr-id -> count map of the Adhkar store.
// ---------------------------------------------------------------------------

export const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "اليوم يجب أن يكون بصيغة YYYY-MM-DD");

export const adhkarCountsSchema = z
  .record(
    z.string().min(1, "معرف الذكر مطلوب").max(100, "معرف الذكر طويل جداً"),
    z.number().int().min(0, "العدد غير صالح").max(1_000_000, "العدد كبير جداً")
  )
  .refine((counts) => Object.keys(counts).length <= 200, {
    message: "عدد الأذكار كبير جداً",
  });

export const upsertAdhkarProgressSchema = z.object({
  counts: adhkarCountsSchema,
});

export type UpsertAdhkarProgressInput = z.infer<
  typeof upsertAdhkarProgressSchema
>;

type PrismaAdhkarProgress = {
  id: string;
  day: string;
  counts: unknown;
  createdAt: Date;
  updatedAt: Date;
};

/** Serialise a progress row into the frontend Adhkar shape. */
export function serializeAdhkarProgress(progress: PrismaAdhkarProgress) {
  return {
    day: progress.day,
    counts: progress.counts,
    updatedAt: progress.updatedAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/** Get the authenticated user's progress for one day (404 if none yet). */
export async function getMyAdhkarProgress(userId: string, day: string) {
  const progress = await prisma.adhkarProgress.findUnique({
    where: { userId_day: { userId, day } },
  });
  if (!progress) {
    throw new UserDataError("لا يوجد تقدم لهذا اليوم", 404);
  }
  return serializeAdhkarProgress(progress);
}

/** Create/update the authenticated user's progress for one day. */
export async function upsertMyAdhkarProgress(
  userId: string,
  day: string,
  input: UpsertAdhkarProgressInput
) {
  const progress = await prisma.adhkarProgress.upsert({
    where: { userId_day: { userId, day } },
    update: { counts: input.counts },
    create: { userId, day, counts: input.counts },
  });
  return serializeAdhkarProgress(progress);
}