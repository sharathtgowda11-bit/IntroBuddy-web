import { getPool, withTenant } from "@introbuddy/db";
import { encodeCompoundToken, provisionInvitationInTransaction, sendInvitationEmail } from "@introbuddy/invitations";
import { getGraduationYearBounds } from "@introbuddy/import";
import { hasPermission, INVITE_TARGET_PERMISSION, InvitationCreateSchema } from "@introbuddy/shared";
import { Router } from "express";
import { getEnv } from "../env.js";
import { findDepartmentById } from "../db/departments.js";
import { findTenantById } from "../db/tenants.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const invitationsRouter = Router();

invitationsRouter.post("/", resolveSession(), async (req, res) => {
  const parsed = InvitationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }
  const { email, role, usn, departmentId, graduationYear } = parsed.data;
  const session = req.session;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  // Permission depends on the target role in the request body, so this
  // can't be a static requirePermission(...) middleware -- see plan D10:
  // super_admin and college_admin can both invite a college_admin;
  // only college_admin can invite a student.
  if (!hasPermission(session.role, INVITE_TARGET_PERMISSION[role])) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  // Schema already guarantees these are present together for a student,
  // optional for an alumnus, and absent for a college_admin
  // (InvitationCreateSchema's superRefine).
  if ((role === "student" || role === "alumni") && graduationYear !== undefined) {
    const { minYear, maxYear } = getGraduationYearBounds(new Date().getFullYear());
    if (graduationYear < minYear || graduationYear > maxYear) {
      res.status(400).json({ error: `graduation year out of plausible range (${minYear}-${maxYear})` });
      return;
    }
  }

  const pool = getPool();
  const env = getEnv();

  try {
    const result = await withTenant(pool, session.tenantId, async (client) => {
      let degreeId: string | undefined;
      let departmentName: string | undefined;
      if ((role === "student" || role === "alumni") && departmentId !== undefined) {
        // RLS scopes this lookup to the caller's own tenant, so a
        // cross-tenant departmentId is indistinguishable from a
        // nonexistent one -- no data leak, just "invalid department".
        const department = await findDepartmentById(client, departmentId);
        if (!department) {
          return { invalidDepartment: true as const };
        }
        degreeId = department.degreeId;
        departmentName = department.name;
      }

      const tenant = await findTenantById(client, session.tenantId);

      const provisioned = await provisionInvitationInTransaction(pool, client, {
        tenantId: session.tenantId,
        email,
        role,
        usn,
        degreeId,
        departmentId,
        graduationYear,
        invitedByCollegeUserId: session.collegeUserId,
      });
      return { invalidDepartment: false as const, provisioned, departmentName, collegeName: tenant?.name };
    });

    if (result.invalidDepartment) {
      res.status(400).json({ error: "department not found in this college's hierarchy" });
      return;
    }

    if (result.provisioned.conflict) {
      res.status(409).json({ error: "an active account already exists for this email" });
      return;
    }

    const activationUrl = `${env.WEB_APP_URL}/activate?token=${encodeCompoundToken(session.tenantId, result.provisioned.rawToken)}`;
    await sendInvitationEmail({
      to: email,
      activationUrl,
      role,
      collegeName: result.collegeName,
      student:
        role === "student"
          ? { name: null, usn: usn ?? null, departmentName: result.departmentName ?? null, graduationYear: graduationYear ?? null }
          : undefined,
      alumnus:
        role === "alumni"
          ? { name: null, departmentName: result.departmentName ?? null, graduationYear: graduationYear ?? null }
          : undefined,
    });

    res.status(201).json({ status: "invited" });
  } catch (error) {
    console.error("failed to create invitation", error);
    res.status(500).json({ error: "internal error" });
  }
});
