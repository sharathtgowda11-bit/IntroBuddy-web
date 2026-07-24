import { getPool, withTenant } from "@introbuddy/db";
import { PERMISSIONS } from "@introbuddy/shared";
import { Router } from "express";
import { getDashboardStats } from "../db/students.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", resolveSession(), requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  try {
    const stats = await withTenant(pool, session.tenantId, (client) => getDashboardStats(client));
    res.status(200).json(stats);
  } catch (error) {
    console.error("failed to load dashboard stats", error);
    res.status(500).json({ error: "internal error" });
  }
});
