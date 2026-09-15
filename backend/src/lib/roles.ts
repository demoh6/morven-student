// ---------------------------------------------------------------------------
// System role constants + permission helpers
// ---------------------------------------------------------------------------
// Role hierarchy: ADMIN (main/admin/owner of the platform) > SUB_ADMIN
// (restricted administrator) > USER (regular student).
//
// - `isAdminRole`  -> true for ADMIN and SUB_ADMIN. Covers every NORMAL admin
//   operation (groups, resources, suggestions, adhkar moderation, ...).
// - `isMainAdminRole` -> true for ADMIN only. Covers administrative role
//   management (promote/demote admins, manage the admin system).

export const ROLE_USER = "USER";
export const ROLE_SUB_ADMIN = "SUB_ADMIN";
export const ROLE_ADMIN = "ADMIN";

export const ADMIN_ROLES = [ROLE_ADMIN, ROLE_SUB_ADMIN] as const;

export type SystemRole = (typeof ADMIN_ROLES)[number] | typeof ROLE_USER;

export function isAdminRole(role: string | null | undefined): boolean {
  return role === ROLE_ADMIN || role === ROLE_SUB_ADMIN;
}

export function isMainAdminRole(role: string | null | undefined): boolean {
  return role === ROLE_ADMIN;
}