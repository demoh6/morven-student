import type { AuthUser } from '@/pages/auth/authApi';
import { isAdminRole } from '@/pages/auth/roles';
import type { Resource } from '@/pages/connect/Resources/resources';

/**
 * Whether the authenticated user can manage (edit/delete/add content to)
 * a given Resource. A user can manage a Resource if they are an Admin (main
 * or sub) or if they are the Resource owner.
 */
export function canManageResource(
  user: AuthUser | null,
  resource: Pick<Resource, 'ownerId'> | null | undefined,
): boolean {
  if (!user) return false;
  if (!resource) return false;
  return isAdminRole(user.role) || user.id === resource.ownerId;
}
