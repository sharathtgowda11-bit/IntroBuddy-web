import { getPool, withTenant } from "@introbuddy/db";
import { PERMISSIONS } from "@introbuddy/shared";
import { Router } from "express";
import { getAlumniDashboardStats } from "../db/alumni.js";
import { getDashboardStats } from "../db/students.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", resolveSession(), requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  try {
    // Alumni counts (total, active, profile-complete) + alumni-by-company,
    // computed the same way student counts already are -- a direct query
    // under withTenant(), not the SECURITY DEFINER function (that one is
    // reserved for the cross-tenant platform view).
    const { studentStats, alumniStats } = await withTenant(pool, session.tenantId, async (client) => {
      const studentStats = await getDashboardStats(client);
      const alumniStats = await getAlumniDashboardStats(client);
      return { studentStats, alumniStats };
    });
    res.status(200).json({ ...studentStats, ...alumniStats });
  } catch (error) {
    console.error("failed to load dashboard stats", error);
    res.status(500).json({ error: "internal error" });
  }
});
