// ---------------------------------------------------------------------------
// System role constants + permission helpers (mirrors backend/src/lib/roles.ts)
// ---------------------------------------------------------------------------

export const ROLE_USER = 'USER';
export const ROLE_SUB_ADMIN = 'SUB_ADMIN';
export const ROLE_ADMIN = 'ADMIN';

/** True when the user is an administrator (either MAIN or SUB). */
export function isAdminRole(role?: string | null): boolean {
  return role === ROLE_ADMIN || role === ROLE_SUB_ADMIN;
}

/** True when the user is the MAIN/sole administrator. */
export function isMainAdminRole(role?: string | null): boolean {
  return role === ROLE_ADMIN;
}
