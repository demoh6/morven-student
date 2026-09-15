import { Request, Response, NextFunction } from "express";
import { ADMIN_ROLES, ROLE_ADMIN } from "../lib/roles";

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "ليس لديك صلاحية للوصول" });
      return;
    }

    next();
  };
}

/**
 * ADMIN-only guard. Administrative role management (promote/demote admins,
 * manage the administrator system) must ALWAYS use this, never requireAdmin.
 */
export function requireMainAdmin() {
  return requireRole(ROLE_ADMIN);
}

/** ADMIN + SUB_ADMIN guard. All normal admin operations use this. */
export function requireAdmin() {
  return requireRole(...ADMIN_ROLES);
}