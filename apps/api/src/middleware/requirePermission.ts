import { hasPermission, type Permission } from "@introbuddy/shared";
import type { NextFunction, Request, Response } from "express";

/** Must run after resolveSession(). Checks a named permission, never a role-string comparison (spec 7.2). */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (!hasPermission(req.session.role, permission)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  };
}
