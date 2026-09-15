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

export async function updateUserRole(userId: string, role: "ADMIN" | "SUB_ADMIN" | "USER") {
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

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role },
    include: usersInclude,
  });

  const { passwordHash, ...safe } = updated;
  return safe;
}
