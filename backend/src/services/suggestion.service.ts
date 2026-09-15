import { z } from "zod";
import prisma from "../lib/prisma";

export class SuggestionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const createSuggestionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, {
      message: "يرجى إدخال اسم الاقتراح",
    })
    .max(200, {
      message: "اسم الاقتراح طويل جداً",
    }),
  content: z
    .string()
    .trim()
    .min(1, {
      message: "يرجى إدخال الموضوع",
    })
    .max(5000, {
      message: "الموضوع طويل جداً",
    }),
  anonymous: z.boolean().optional().default(false),
});

export type CreateSuggestionInput = z.infer<typeof createSuggestionSchema>;

export async function createSuggestion(userId: string, input: CreateSuggestionInput) {
  const suggestion = await prisma.suggestion.create({
    data: {
      title: input.title,
      content: input.content,
      anonymous: input.anonymous,
      userId,
    },
  });
  return suggestion;
}

/**
 * Permanently removes a suggestion. ADMIN-only.
 */
export async function deleteSuggestion(suggestionId: string) {
  const existing = await prisma.suggestion.findUnique({
    where: { id: suggestionId },
  });
  if (!existing) {
    throw new SuggestionError("الاقتراح غير موجود", 404);
  }
  return prisma.suggestion.delete({ where: { id: suggestionId } });
}

export async function listSuggestions() {
  const suggestions = await prisma.suggestion.findMany({
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
  return suggestions.map(({ user, ...suggestion }) => ({
    ...suggestion,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.profile?.avatarUrl ?? null,
    },
  }));
}
