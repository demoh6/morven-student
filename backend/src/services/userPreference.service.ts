import { z } from "zod";
import prisma from "../lib/prisma";

// ---------------------------------------------------------------------------
// Validation schemas
//
// Mirrors the preferences identified during Phase 1: UI theme, recent tools,
// Pomodoro settings and the Adhkar reminder slot state. Every field is
// optional on update; the row is upserted so the user always has exactly one.
// ---------------------------------------------------------------------------

export const updatePreferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  recentTools: z
    .array(z.string().trim().min(1, "اسم الأداة مطلوب").max(100, "اسم الأداة طويل جداً"))
    .max(20, "قائمة الأدوات كبيرة جداً")
    .optional(),
  pomodoroFocusMinutes: z.number().int().min(1).max(180).optional(),
  pomodoroBreakMinutes: z.number().int().min(1).max(60).optional(),
  pomodoroLongBreakMinutes: z.number().int().min(1).max(120).optional(),
  pomodoroSessionsUntilLongBreak: z.number().int().min(1).max(20).optional(),
  pomodoroTheme: z.enum(["classic", "digital", "nature"]).optional(),
  pomodoroTimerMode: z.enum(["countdown", "countup"]).optional(),
  adhkarReminderShownMorning: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  adhkarReminderDismissedMorning: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  adhkarReminderShownEvening: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  adhkarReminderDismissedEvening: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

type PrismaPreferences = {
  theme: string;
  recentTools: string[];
  pomodoroFocusMinutes: number;
  pomodoroBreakMinutes: number;
  pomodoroLongBreakMinutes: number;
  pomodoroSessionsUntilLongBreak: number;
  pomodoroTheme: string;
  pomodoroTimerMode: string;
  adhkarReminderShownMorning: string | null;
  adhkarReminderDismissedMorning: string | null;
  adhkarReminderShownEvening: string | null;
  adhkarReminderDismissedEvening: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const POMODORO_THEME_MAP = {
  classic: "CLASSIC",
  digital: "DIGITAL",
  nature: "NATURE",
} as const;

const POMODORO_TIMER_MODE_MAP = {
  countdown: "COUNTDOWN",
  countup: "COUNTUP",
} as const;

/** Serialise the preference row into plain config values. */
export function serializePreferences(prefs: PrismaPreferences) {
  return {
    theme: prefs.theme,
    recentTools: prefs.recentTools,
    pomodoroFocusMinutes: prefs.pomodoroFocusMinutes,
    pomodoroBreakMinutes: prefs.pomodoroBreakMinutes,
    pomodoroLongBreakMinutes: prefs.pomodoroLongBreakMinutes,
    pomodoroSessionsUntilLongBreak: prefs.pomodoroSessionsUntilLongBreak,
    pomodoroTheme: prefs.pomodoroTheme.toLowerCase(),
    pomodoroTimerMode: prefs.pomodoroTimerMode.toLowerCase(),
    adhkarReminderShownMorning: prefs.adhkarReminderShownMorning ?? undefined,
    adhkarReminderDismissedMorning: prefs.adhkarReminderDismissedMorning ?? undefined,
    adhkarReminderShownEvening: prefs.adhkarReminderShownEvening ?? undefined,
    adhkarReminderDismissedEvening: prefs.adhkarReminderDismissedEvening ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/** Get the authenticated user's preferences, creating defaults on first use. */
export async function getMyPreferences(userId: string) {
  let prefs = await prisma.userPreference.findUnique({ where: { userId } });
  if (!prefs) {
    prefs = await prisma.userPreference.create({ data: { userId } });
  }
  return serializePreferences(prefs);
}

/** Update the authenticated user's preferences (safe upsert, one row/user). */
export async function updateMyPreferences(
  userId: string,
  input: UpdatePreferencesInput
) {
  const data: Record<string, unknown> = { ...input };
  if (input.pomodoroTheme !== undefined) {
    data.pomodoroTheme = POMODORO_THEME_MAP[input.pomodoroTheme];
  }
  if (input.pomodoroTimerMode !== undefined) {
    data.pomodoroTimerMode = POMODORO_TIMER_MODE_MAP[input.pomodoroTimerMode];
  }

  const prefs = await prisma.userPreference.upsert({
    where: { userId },
    update: { ...data },
    create: { userId, ...data },
  });
  return serializePreferences(prefs);
}