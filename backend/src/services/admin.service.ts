import { z } from "zod";
import prisma from "../lib/prisma";
import { ROLE_ADMIN, ROLE_SUB_ADMIN, ROLE_USER } from "../lib/roles";

export class AdminError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const updateRoleSchema = z.object({
  role: z.enum([ROLE_ADMIN, ROLE_SUB_ADMIN, ROLE_USER], {
    error: "الدور غير صالح",
  }),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  role: true,
  createdAt: true,
  lastLoginAt: true,
  profile: { select: { avatarUrl: true } },
} as const;

const usersInclude = {
  profile: { select: { avatarUrl: true } },
} as const;

export async function listUsers() {
  const users = await prisma.user.findMany({
    include: usersInclude,
    orderBy: { createdAt: "asc" },
  });
  return users.map(({ passwordHash, ...user }) => user);
}

// Targeted notification sent whenever a user is FIRST granted the SUB_ADMIN
// role. It is deliberately worded as a plain "Admin" appointment — the
// SUB_ADMIN tier is an internal-admin concern and is never shown to the user.
const SUB_ADMIN_PROMOTION_TITLE = "تهانينا! 🎉";
const SUB_ADMIN_PROMOTION_BODY =
  "تم تعيينك كمشرف في مورفن.\nنتمنى لك التوفيق في مسؤولياتك الجديدة.";

export async function updateUserRole(userId: string, role: "ADMIN" | "SUB_ADMIN" | "USER", actorId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    throw new AdminError("المستخدم غير موجود", 404);
  }

  // Demoting (or downgrading) the last ADMIN would leave the system with zero
  // main admins and none of the admin-management rights. Preserved from the
  // original implementation: a single main ADMIN is never stripped of ADMIN.
  if (target.role === ROLE_ADMIN && role !== ROLE_ADMIN) {
    const adminCount = await prisma.user.count({ where: { role: ROLE_ADMIN } });
    if (adminCount <= 1) {
      throw new AdminError(
        "لا يمكن إزالة صلاحية المشرف الأخير — يجب أن يبقى مشرف واحد على الأقل",
        400
      );
    }
  }

  // Notify ONLY on a fresh SUB_ADMIN assignment (not on demotion, promotion to
  // ADMIN, or re-assignment to an already-SUB_ADMIN account). Runs in the same
  // transaction as the role update so the notification never fires unless the
  // assignment itself succeeds (mirrors the targeted dhikr-rejection pattern).
  const isNewSubAdminAssignment =
    role === ROLE_SUB_ADMIN && target.role !== ROLE_SUB_ADMIN;

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { role },
      include: usersInclude,
    });

    if (isNewSubAdminAssignment) {
      await tx.appNotification.create({
        data: {
          title: SUB_ADMIN_PROMOTION_TITLE,
          body: SUB_ADMIN_PROMOTION_BODY,
          type: "info",
          createdBy: actorId,
          targetUserId: userId,
        },
      });
    }

    return user;
  });

  const { passwordHash, ...safe } = updated;
  return safe;
}
