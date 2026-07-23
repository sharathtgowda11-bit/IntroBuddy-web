import { getPool, withTenant } from "@introbuddy/db";
import type { Role } from "@introbuddy/shared";
import type { NextFunction, Request, Response } from "express";
import { decodeCompoundToken, hashToken } from "@introbuddy/invitations";
import { findSessionByTokenHash, touchSessionLastUsed } from "../db/sessions.js";

export interface RequestSession {
  tenantId: string;
  collegeUserId: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    session?: RequestSession;
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * Implements spec 6.2/6.3: resolve identity, look up the college_users row
 * for tenant + role, and only then let a request proceed -- there is no
 * other way to establish tenant context. The tenant is never read from a
 * header, URL parameter, or request body directly (spec 14.1 #1); it comes
 * only from the compound session token's prefix, which is itself just a
 * routing hint until this lookup confirms it.
 *
 * The explicit `session.tenantId !== decoded.tenantId` check below is
 * intentionally redundant with what RLS already guarantees (the query
 * runs scoped to decoded.tenantId, so RLS alone could never return a
 * mismatched row). It stays anyway: RLS is the last line of defence, not
 * the only one, and this check keeps the invariant true even if the query
 * above is ever refactored to not go through withTenant correctly.
 */
export function resolveSession() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const compoundToken = extractBearerToken(req);
    if (!compoundToken) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const decoded = decodeCompoundToken(compoundToken);
    if (!decoded) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const tokenHash = hashToken(decoded.rawToken);
    const pool = getPool();

    try {
      const session = await withTenant(pool, decoded.tenantId, (client) =>
        findSessionByTokenHash(client, tokenHash),
      );

      const isValid =
        session !== null &&
        session.tenantId === decoded.tenantId &&
        session.revokedAt === null &&
        session.expiresAt.getTime() > Date.now();

      if (!session || !isValid) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }

      await withTenant(pool, decoded.tenantId, (client) => touchSessionLastUsed(client, session.id));

      req.session = {
        tenantId: session.tenantId,
        collegeUserId: session.collegeUserId,
        role: session.role,
      };
      next();
    } catch {
      res.status(401).json({ error: "unauthorized" });
    }
  };
}
