import { getPool, withTenant } from "@introbuddy/db";
import { PERMISSIONS } from "@introbuddy/shared";
import { Router } from "express";
import { listAuditLog } from "../db/auditLog.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const auditLogRouter = Router();

auditLogRouter.get("/", resolveSession(), requirePermission(PERMISSIONS.AUDIT_LOG_VIEW), async (req, res) => {
  const session = req.session!;
  const pool = getPool();
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  try {
    const result = await withTenant(pool, session.tenantId, (client) => listAuditLog(client, { limit, offset }));
    res.status(200).json(result);
  } catch (error) {
    console.error("failed to load audit log", error);
    res.status(500).json({ error: "internal error" });
  }
});
