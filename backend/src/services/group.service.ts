import { z } from "zod";
import crypto from "crypto";
import prisma from "../lib/prisma";
import { isAdminRole } from "../lib/roles";
import { Prisma, GroupRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

export const createGroupSchema = z.object({
  name: z.string().min(1, "اسم المجموعة مطلوب").max(100, "اسم المجموعة طويل جداً"),
  description: z.string().max(500, "الوصف طويل جداً").optional(),
  imageUrl: z.string().max(500).optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1, "اسم المجموعة مطلوب").max(100, "اسم المجموعة طويل جداً").optional(),
  description: z.string().max(500, "الوصف طويل جداً").optional(),
  imageUrl: z.string().max(500).nullable().optional(),
});

export const joinGroupSchema = z.object({
  joinCode: z.string().length(6, "رمز الانضمام يجب أن يكون 6 أرقام").regex(/^\d{6}$/, "رمز الانضمام يجب أن يكون أرقام فقط"),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"], { message: "الدور غير صالح" }),
});

export const MAX_GROUPS_PER_USER = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A system ADMIN or SUB_ADMIN (User.role) has management access to every
 *  Group, regardless of membership. */
export function isGlobalAdmin(userRole: string | undefined): boolean {
  return isAdminRole(userRole);
}

/**
 * The requester's effective role within a group, used for authorization and UI.
 * - A system ADMIN manages every group, except the ones they OWN (so they keep
 *   owner semantics there).
 * - Everyone else keeps their actual GroupMember role.
 * - Never returns a role for a non-member non-ADMIN (the caller must reject).
 */
function requesterRole(membershipRole: GroupRole | undefined, userRole: string | undefined): string | undefined {
  if (!isGlobalAdmin(userRole)) return membershipRole;
  if (membershipRole === "OWNER") return "OWNER";
  return "ADMIN";
}

function generateJoinCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

async function getMembership(groupId: string, userId: string) {
  return prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
}

async function ensureUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateJoinCode();
    const existing = await prisma.group.findUnique({ where: { joinCode: code } });
    if (!existing) return code;
  }
  throw new Error("تعذر إنشاء رمز فريد");
}

function sanitizeGroup(group: {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  joinCode: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    imageUrl: group.imageUrl,
    joinCode: group.joinCode,
    creatorId: group.creatorId,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createGroup(userId: string, userRole: string, input: z.infer<typeof createGroupSchema>) {
  // Platform ADMIN/SUB_ADMIN (User.role) is exempt from the 3-group limit.
  const membershipCount = await prisma.groupMember.count({ where: { userId } });
  if (!isGlobalAdmin(userRole) && membershipCount >= MAX_GROUPS_PER_USER) {
    throw new GroupError("لقد وصلت إلى الحد الأقصى من المجموعات (3)", 400);
  }

  const joinCode = await ensureUniqueJoinCode();

  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.group.create({
      data: {
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl || null,
        joinCode,
        creatorId: userId,
      },
    });

    await tx.groupMember.create({
      data: { groupId: g.id, userId, role: "OWNER" },
    });

    return g;
  });

  return sanitizeGroup(group);
}

export async function joinGroup(userId: string, userRole: string, joinCode: string) {
  const group = await prisma.group.findUnique({ where: { joinCode } });
  if (!group) {
    throw new GroupError("رمز الانضمام غير صالح", 404);
  }

  const existing = await getMembership(group.id, userId);
  if (existing) {
    throw new GroupError("أنت عضو بالفعل في هذه المجموعة", 409);
  }

  // Platform ADMIN/SUB_ADMIN (User.role) is exempt from the 3-group limit.
  const membershipCount = await prisma.groupMember.count({ where: { userId } });
  if (!isGlobalAdmin(userRole) && membershipCount >= MAX_GROUPS_PER_USER) {
    throw new GroupError("لقد وصلت إلى الحد الأقصى من المجموعات (3)", 400);
  }

  await prisma.groupMember.create({
    data: { groupId: group.id, userId, role: "MEMBER" },
  });

  return sanitizeGroup(group);
}

export async function listUserGroups(userId: string, userRole: string) {
  const admin = isGlobalAdmin(userRole);

  const requesterMemberships = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true, role: true },
  });
  const roleByGroup = new Map<string, GroupRole>(requesterMemberships.map((m) => [m.groupId, m.role]));

  let groups: Array<{
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    joinCode: string;
    creatorId: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { members: number };
  }>;

  if (admin) {
    // A system ADMIN sees EVERY group in the system, not just their memberships.
    groups = await prisma.group.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "desc" },
    });
  } else {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    groups = memberships.map((m) => m.group);
  }

  return groups.map((g) => {
    const membershipRole = roleByGroup.get(g.id);
    return {
      ...sanitizeGroup(g),
      role: requesterRole(membershipRole, userRole),
      isMember: membershipRole != null,
      memberCount: g._count.members,
    };
  });
}

export async function getGroupDetails(groupId: string, userId: string, userRole: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: { select: { id: true, username: true, displayName: true, profile: { select: { avatarUrl: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!group) {
    throw new GroupError("المجموعة غير موجودة", 404);
  }

  const membership = await getMembership(groupId, userId);
  if (!membership && !isGlobalAdmin(userRole)) {
    throw new GroupError("غير مصرح", 403);
  }

  return {
    ...sanitizeGroup(group),
    role: requesterRole(membership?.role, userRole),
    isMember: membership != null,
    members: group.members.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
      avatarUrl: m.user.profile?.avatarUrl ?? null,
      role: m.role,
      joinedAt: m.createdAt,
    })),
  };
}

/**
 * Transfers ownership away from the current OWNER and removes them — the same
 * logic used when an OWNER leaves. Returns true if the group was deleted
 * because no other members remained.
 */
async function transferOwnershipAndRemoveOwner(tx: Prisma.TransactionClient, groupId: string, currentOwnerId: string): Promise<boolean> {
  // The successor is the earliest-joining remaining member.
  const successor = await tx.groupMember.findFirst({
    where: { groupId, userId: { not: currentOwnerId } },
    orderBy: { createdAt: "asc" },
  });

  if (!successor) {
    // No other members remain — the group is now empty. Delete it.
    await tx.group.delete({ where: { id: groupId } });
    return true;
  }

  await tx.groupMember.update({
    where: { groupId_userId: { groupId, userId: successor.userId } },
    data: { role: "OWNER" },
  });

  // Remove the previous OWNER completely.
  await tx.groupMember.delete({
    where: { groupId_userId: { groupId, userId: currentOwnerId } },
  });
  return false;
}

export async function leaveGroup(groupId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new GroupError("المجموعة غير موجودة", 404);
    }

    const membership = await tx.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership) {
      throw new GroupError("غير مصرح", 403);
    }

    // Non-owner: simply leave.
    if (membership.role !== "OWNER") {
      await tx.groupMember.delete({
        where: { groupId_userId: { groupId, userId } },
      });
      return;
    }

    // OWNER leaving: transfer ownership to the earliest remaining member so
    // the group is never left without an owner.
    await transferOwnershipAndRemoveOwner(tx, groupId, userId);
  });
}

export async function deleteGroup(groupId: string, userId: string, userRole: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new GroupError("المجموعة غير موجودة", 404);
  }

  const membership = await getMembership(groupId, userId);
  const admin = isGlobalAdmin(userRole);
  if (!admin && (!membership || membership.role !== "OWNER")) {
    throw new GroupError("فقط المالك يمكنه حذف المجموعة", 403);
  }

  // A non-ADMIN OWNER cannot delete a group that has other members.
  if (!admin && membership!.role === "OWNER") {
    const memberCount = await prisma.groupMember.count({ where: { groupId } });
    if (memberCount > 1) {
      throw new GroupError("لا يمكن حذف المجموعة وهي تحتوي على طلاب آخرين", 400);
    }
  }

  await prisma.group.delete({ where: { id: groupId } });
}

export async function removeMember(groupId: string, targetUserId: string, requesterId: string, userRole: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new GroupError("المجموعة غير موجودة", 404);
  }

  const requesterMembership = await getMembership(groupId, requesterId);
  // A system ADMIN or a group ADMIN member may remove members.
  if (!isGlobalAdmin(userRole) && requesterMembership?.role !== "ADMIN") {
    throw new GroupError("غير مصرح", 403);
  }

  if (requesterId === targetUserId) {
    throw new GroupError("لا يمكن إزالة نفسك", 400);
  }

  const targetMembership = await getMembership(groupId, targetUserId);
  if (!targetMembership) {
    throw new GroupError("العضو غير موجود", 404);
  }

  // Removing the current OWNER transfers ownership to the earliest-joining
  // remaining member (the same behavior as when the OWNER leaves voluntarily).
  if (targetMembership.role === "OWNER") {
    await prisma.$transaction((tx) => transferOwnershipAndRemoveOwner(tx, groupId, targetUserId));
    return;
  }

  await prisma.groupMember.delete({
    where: { groupId_userId: { groupId, userId: targetUserId } },
  });
}

export async function updateMemberRole(groupId: string, targetUserId: string, newRole: "ADMIN" | "MEMBER", requesterId: string, userRole: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new GroupError("المجموعة غير موجودة", 404);
  }

  const requesterMembership = await getMembership(groupId, requesterId);
  // Only the OWNER or a system ADMIN may change member roles.
  if (!isGlobalAdmin(userRole) && requesterMembership?.role !== "OWNER") {
    throw new GroupError("فقط المالك يمكنه تغيير الأدوار", 403);
  }

  if (targetUserId === requesterId) {
    throw new GroupError("المالك لا يمكنه تغيير دوره", 400);
  }

  const targetMembership = await getMembership(groupId, targetUserId);
  if (!targetMembership) {
    throw new GroupError("العضو غير موجود", 404);
  }

  if (targetMembership.role === "OWNER") {
    throw new GroupError("لا يمكن تغيير دور المالك", 403);
  }

  await prisma.groupMember.update({
    where: { groupId_userId: { groupId, userId: targetUserId } },
    data: { role: newRole },
  });
}

export async function updateGroup(groupId: string, userId: string, userRole: string, input: z.infer<typeof updateGroupSchema>) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) {
    throw new GroupError("المجموعة غير موجودة", 404);
  }

  const membership = await getMembership(groupId, userId);
  const canManage = membership != null && (membership.role === "OWNER" || membership.role === "ADMIN");
  if (!canManage && !isGlobalAdmin(userRole)) {
    throw new GroupError("المالك أو المدير فقط يمكنه تعديل المجموعة", 403);
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl || null;

  const updated = await prisma.group.update({
    where: { id: groupId },
    data,
  });

  return sanitizeGroup(updated);
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class GroupError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GroupError";
    this.status = status;
  }
}
