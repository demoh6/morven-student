import { z } from "zod";
import prisma from "../lib/prisma";

// ---------------------------------------------------------------------------
// Validation schemas
//
// Personal Pomodoro statistics are NEVER mixed with group PomodoroSession
// rows. Writes are additive increments (not blind counter replacement), so
// concurrent completions from multiple devices cannot overwrite each other.
// ---------------------------------------------------------------------------

export const recordSessionSchema = z.object({
  // Duration in seconds of one completed personal focus session.
  sessionSeconds: z
    .number()
    .int()
    .min(1, "مدة الجلسة غير صالحة")
    .max(7200, "مدة الجلسة كبيرة جداً"),
});

export type RecordSessionInput = z.infer<typeof recordSessionSchema>;

/**
 * Migration-time merge payload. Accepts an optional full snapshot of the
 * lifetime counters and merges each field by taking the MAX of the stored and
 * incoming values (never a destructive overwrite). Idempotent — merging the
 * same snapshot twice converges to the same values.
 */
export const mergePomodoroStatsSchema = z
  .object({
    completedSessions: z.number().int().min(0).optional(),
    totalFocusSeconds: z.number().int().min(0).optional(),
    lastFocusSeconds: z.number().int().min(0).optional(),
  })
  .refine(
    (vals) =>
      vals.completedSessions !== undefined ||
      vals.totalFocusSeconds !== undefined ||
      vals.lastFocusSeconds !== undefined,
    { message: "أرسل قيمة واحدة على الأقل لعملية الدمج" }
  );

export type MergePomodoroStatsInput = z.infer<typeof mergePomodoroStatsSchema>;

type PrismaPomodoroStats = {
  id: string;
  completedSessions: number;
  totalFocusSeconds: number;
  lastFocusSeconds: number;
  updatedAt: Date;
};

/** Serialise the personal stats row (epoch-ms updatedAt for the frontend). */
export function serializePomodoroStats(stats: PrismaPomodoroStats) {
  return {
    completedSessions: stats.completedSessions,
    totalFocusSeconds: stats.totalFocusSeconds,
    lastFocusSeconds: stats.lastFocusSeconds,
    updatedAt: stats.updatedAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/** Get the authenticated user's personal stats, creating the row on first use. */
export async function getMyPomodoroStats(userId: string) {
  let stats = await prisma.pomodoroStats.findUnique({ where: { userId } });
  if (!stats) {
    stats = await prisma.pomodoroStats.create({ data: { userId } });
  }
  return serializePomodoroStats(stats);
}

/**
 * Record one completed personal focus session atomically:
 *   completedSessions +1, totalFocusSeconds +sessionSeconds, lastFocusSeconds set.
 * An upsert keeps this safe for devices that have never synced before.
 */
export async function recordMyPomodoroSession(
  userId: string,
  input: RecordSessionInput
) {
  const stats = await prisma.pomodoroStats.upsert({
    where: { userId },
    update: {
      completedSessions: { increment: 1 },
      totalFocusSeconds: { increment: input.sessionSeconds },
      lastFocusSeconds: input.sessionSeconds,
    },
    create: {
      userId,
      completedSessions: 1,
      totalFocusSeconds: input.sessionSeconds,
      lastFocusSeconds: input.sessionSeconds,
    },
  });
  return serializePomodoroStats(stats);
}

/**
 * Merge a guest device's lifetime counters into the account row using
 * element-wise MAX. Deterministic and idempotent on retry; never reduces an
 * existing value, so concurrent migrations from multiple devices cannot
 * overwrite one another. This is the migration mechanism for personal Pomodoro
 * statistics (the additive per-session endpoint stays the live path).
 */
export async function mergeMyPomodoroStats(
  userId: string,
  input: MergePomodoroStatsInput
) {
  const upsertMax = async () =>
    prisma.$transaction(async (tx) => {
      const current = await tx.pomodoroStats.findUnique({ where: { userId } });
      if (!current) {
        const created = await tx.pomodoroStats.create({
          data: {
            userId,
            completedSessions: input.completedSessions ?? 0,
            totalFocusSeconds: input.totalFocusSeconds ?? 0,
            lastFocusSeconds: input.lastFocusSeconds ?? 0,
          },
        });
        return serializePomodoroStats(created);
      }
      const updated = await tx.pomodoroStats.update({
        where: { userId },
        data: {
          completedSessions:
            input.completedSessions !== undefined
              ? Math.max(current.completedSessions, input.completedSessions)
              : undefined,
          totalFocusSeconds:
            input.totalFocusSeconds !== undefined
              ? Math.max(current.totalFocusSeconds, input.totalFocusSeconds)
              : undefined,
          lastFocusSeconds:
            input.lastFocusSeconds !== undefined
              ? Math.max(current.lastFocusSeconds, input.lastFocusSeconds)
              : undefined,
        },
      });
      return serializePomodoroStats(updated);
    });

  try {
    return await upsertMax();
  } catch (err) {
    // Serializable-transaction write conflict: retry once (both transactions
    // recompute against the fresh row, so MAX converges).
    const code = (err as { code?: string }).code;
    if (code === "P2034") return upsertMax();
    throw err;
  }
}