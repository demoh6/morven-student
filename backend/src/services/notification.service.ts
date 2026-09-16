import { z } from "zod";
import prisma from "../lib/prisma";

export const createNotificationSchema = z.object({
  title: z
    .string()
    .min(1, "العنوان مطلوب")
    .max(120, "العنوان طويل جداً")
    .trim(),
  body: z
    .string()
    .min(1, "النص مطلوب")
    .max(1000, "النص طويل جداً")
    .trim(),
  type: z.enum(["info", "announcement", "update"], {
    error: "نوع الإشعار غير صالح",
  }),
});

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

export async function listNotifications(userId: string) {
  const [notifications, reads] = await Promise.all([
    prisma.appNotification.findMany({
      where: {
        // Target-scoped notifications (e.g. dhikr rejection) are visible ONLY
        // to their target user; NULL keeps a notification global/broadcast.
        OR: [{ targetUserId: null }, { targetUserId: userId }],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.userNotificationRead.findMany({
      where: { userId },
      select: { notificationId: true },
    }),
  ]);

  const readIds = new Set(reads.map((r) => r.notificationId));
  return notifications.map((n) => ({ ...n, read: readIds.has(n.id) }));
}

export async function createNotification(
  input: CreateNotificationInput,
  createdBy: string
) {
  return prisma.appNotification.create({
    data: { ...input, createdBy },
  });
}

export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<boolean> {
  // The caller must own the notification or it must be a broadcast (targetUserId null).
  // Without this check any user could mark any targeted notification as read.
  const existing = await prisma.appNotification.findUnique({
    where: { id: notificationId },
    select: { id: true, targetUserId: true },
  });
  if (!existing) return false;
  if (existing.targetUserId !== null && existing.targetUserId !== userId) return false;

  await prisma.userNotificationRead.upsert({
    where: { userId_notificationId: { userId, notificationId } },
    update: { readAt: new Date() },
    create: { userId, notificationId },
  });
  return true;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const notifications = await prisma.appNotification.findMany({
    where: {
      OR: [{ targetUserId: null }, { targetUserId: userId }],
    },
    select: { id: true },
  });
  if (notifications.length === 0) return;

  await prisma.userNotificationRead.createMany({
    data: notifications.map((n) => ({ userId, notificationId: n.id })),
    skipDuplicates: true,
  });
}

export async function unmarkNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  await prisma.userNotificationRead.deleteMany({
    where: { userId, notificationId },
  });
}

export async function deleteNotification(id: string) {
  try {
    const result = await prisma.$transaction([
      prisma.userNotificationRead.deleteMany({ where: { notificationId: id } }),
      prisma.appNotification.deleteMany({ where: { id } }),
    ]);
    return result[1].count > 0;
  } catch {
    return false;
  }
}
