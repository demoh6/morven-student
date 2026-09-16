import { z } from "zod";
import prisma from "../lib/prisma";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(1, "الاسم المعروض مطلوب")
    .max(100, "الاسم المعروض طويل جداً")
    .optional(),
  bio: z
    .string()
    .max(500, "السيرة الذاتية طويلة جداً")
    .optional(),
  isPublic: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

type ProfileWithUser = {
  id: string;
  bio: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
};

function sanitizePublicProfile(profile: ProfileWithUser) {
  return {
    id: profile.id,
    username: profile.user.username,
    displayName: profile.user.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    isPublic: profile.isPublic,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function sanitizeOwnProfile(profile: {
  id: string;
  bio: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string;
  };
}) {
  return {
    id: profile.id,
    email: profile.user.email,
    username: profile.user.username,
    displayName: profile.user.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    isPublic: profile.isPublic,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

async function ensureProfile(userId: string) {
  let profile = await prisma.profile.findUnique({
    where: { userId },
  });

  if (!profile) {
    profile = await prisma.profile.create({
      data: { userId },
    });
  }

  return profile;
}

/**
 * Get the current user's own profile. Creates one if it doesn't exist yet.
 */
export async function getOwnProfile(userId: string) {
  await ensureProfile(userId);

  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: {
      user: {
        select: { id: true, email: true, username: true, displayName: true },
      },
    },
  });

  return sanitizeOwnProfile(profile!);
}

/**
 * Update the current user's own profile. Creates the profile if it doesn't exist.
 * Also updates displayName on the User model if provided.
 */
export async function updateOwnProfile(userId: string, input: UpdateProfileInput) {
  await ensureProfile(userId);

  // If displayName is changing, update on the User model too
  if (input.displayName !== undefined) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    if (user && input.displayName !== user.displayName) {
      await prisma.user.update({
        where: { id: userId },
        data: { displayName: input.displayName },
      });
    }
  }

  const profileData: Record<string, unknown> = {};
  if (input.bio !== undefined) profileData.bio = input.bio || null;
  if (input.isPublic !== undefined) profileData.isPublic = input.isPublic;

  const updated = await prisma.profile.update({
    where: { userId },
    data: profileData,
    include: {
      user: {
        select: { id: true, email: true, username: true, displayName: true },
      },
    },
  });

  return sanitizeOwnProfile(updated);
}

/**
 * Get a public profile by username. Respects isPublic setting.
 * Returns null if user doesn't exist.
 */
export async function getPublicProfile(username: string) {
  const profile = await prisma.profile.findFirst({
    where: {
      user: { username },
    },
    include: {
      user: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  if (!profile) {
    return null;
  }

  if (!profile.isPublic) {
    // Private profile: expose only minimal, non-sensitive identity (username,
    // display name, avatar). Bio, achievements, and stats are NOT included.
    return {
      isPublic: false as const,
      username: profile.user.username,
      displayName: profile.user.displayName,
      avatarUrl: profile.avatarUrl,
    };
  }

  return sanitizePublicProfile(profile);
}

// ---------------------------------------------------------------------------
// Achievements (server-side counters, seeded from dashboard data)
// ---------------------------------------------------------------------------

export const achievementValuesSchema = z.object({
  completedTasks: z.number().int().min(0).default(0),
  cardsReviewed: z.number().int().min(0).default(0),
  completedSessions: z.number().int().min(0).default(0),
  meaningfulNotes: z.number().int().min(0).default(0),
  files: z.number().int().min(0).default(0),
  flashcards: z.number().int().min(0).default(0),
  quizzesCompleted: z.number().int().min(0).default(0),
});

export type AchievementValues = z.infer<typeof achievementValuesSchema>;

type AchievementWithUsername = {
  username: string;
  completedTasks: number;
  cardsReviewed: number;
  completedSessions: number;
  meaningfulNotes: number;
  files: number;
  flashcards: number;
  quizzesCompleted: number;
  updatedAt: Date | null;
};

function sanitizeAchievements(a: AchievementWithUsername) {
  return {
    username: a.username,
    completedTasks: a.completedTasks,
    cardsReviewed: a.cardsReviewed,
    completedSessions: a.completedSessions,
    meaningfulNotes: a.meaningfulNotes,
    files: a.files,
    flashcards: a.flashcards,
    quizzesCompleted: a.quizzesCompleted,
    totalAchievements:
      a.completedTasks +
      a.cardsReviewed +
      a.completedSessions +
      a.meaningfulNotes +
      a.files +
      a.flashcards +
      a.quizzesCompleted,
    updatedAt: a.updatedAt,
  };
}

/**
 * Sync the current user's achievements counters (seeded from the dashboard data).
 * Creates the row if it doesn't exist yet.
 * This is the existing PUT path (overwrite); kept for frontend compatibility.
 */
export async function syncMyAchievements(userId: string, values: AchievementValues) {
  const data = {
    completedTasks: values.completedTasks,
    cardsReviewed: values.cardsReviewed,
    completedSessions: values.completedSessions,
    meaningfulNotes: values.meaningfulNotes,
    files: values.files,
    flashcards: values.flashcards,
    quizzesCompleted: values.quizzesCompleted,
  };

  await prisma.userAchievement.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  return true;
}

// ---------------------------------------------------------------------------
// Additive achievements increment (safe for concurrent post-completion saves)
// ---------------------------------------------------------------------------

export const incrementAchievementsSchema = z
  .object({
    completedTasks: z.number().int().min(0).optional(),
    cardsReviewed: z.number().int().min(0).optional(),
    completedSessions: z.number().int().min(0).optional(),
    meaningfulNotes: z.number().int().min(0).optional(),
    files: z.number().int().min(0).optional(),
    flashcards: z.number().int().min(0).optional(),
    quizzesCompleted: z.number().int().min(0).optional(),
  })
  .refine(
    (vals) => Object.values(vals).some((v) => v !== undefined && v > 0),
    { message: "أرسل قيمة أكبر من الصفر لشريحة واحدة على الأقل" }
  );

export type IncrementAchievementsInput = z.infer<typeof incrementAchievementsSchema>;

/**
 * Atomically increment the current user's achievement counters. Row is
 * created on first write (upsert). Unlike the PUT overwrite path, this
 * is safe for concurrent completions — every post-completion save adds
 * exactly +1 (or more if the client explicitly says so).
 */
export async function incrementMyAchievements(
  userId: string,
  input: IncrementAchievementsInput
) {
  const incrementData: Record<string, { increment: number }> = {};
  const createData: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value > 0) {
      incrementData[key] = { increment: value };
      createData[key] = value;
    }
  }

  if (Object.keys(incrementData).length === 0) {
    throw new Error("أرسل قيمة أكبر من الصفر لشريحة واحدة على الأقل");
  }

  const achievements = await prisma.userAchievement.upsert({
    where: { userId },
    update: incrementData,
    create: { userId, ...createData },
  });

  return {
    completedTasks: achievements.completedTasks,
    cardsReviewed: achievements.cardsReviewed,
    completedSessions: achievements.completedSessions,
    meaningfulNotes: achievements.meaningfulNotes,
    files: achievements.files,
    flashcards: achievements.flashcards,
    quizzesCompleted: achievements.quizzesCompleted,
  };
}

/**
 * Get a user's achievements by username. Respects isPublic.
 * Returns null if the user doesn't exist, { isPublic: false } if the profile is private.
 */
export async function getPublicAchievements(username: string) {
  const profile = await prisma.profile.findFirst({
    where: { user: { username } },
    select: { isPublic: true },
  });

  if (!profile) {
    return null;
  }

  if (!profile.isPublic) {
    return { private: true as const, username };
  }

  const achievements = await prisma.user.findFirst({
    where: { username },
    select: {
      username: true,
      achievements: {
        select: {
          completedTasks: true,
          cardsReviewed: true,
          completedSessions: true,
          meaningfulNotes: true,
          files: true,
          flashcards: true,
          quizzesCompleted: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!achievements || !achievements.achievements) {
    return {
      private: false as const,
      username,
      completedTasks: 0,
      cardsReviewed: 0,
      completedSessions: 0,
      meaningfulNotes: 0,
      files: 0,
      flashcards: 0,
      quizzesCompleted: 0,
      totalAchievements: 0,
      updatedAt: null,
    };
  }

  return {
    private: false as const,
    ...sanitizeAchievements({
      username: achievements.username,
      ...achievements.achievements,
    } as AchievementWithUsername),
  };
}
