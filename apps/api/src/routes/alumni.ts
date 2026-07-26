import { getPool, withTenant } from "@introbuddy/db";
import { encodeCompoundToken, generateRawToken, hashToken, provisionInvitationInTransaction, sendInvitationEmail } from "@introbuddy/invitations";
import {
  AlumniCreateSchema,
  AlumniEditSchema,
  AlumniStatusUpdateSchema,
  PERMISSIONS,
  type CollegeUserStatus,
} from "@introbuddy/shared";
import { Router } from "express";
import { findAlumniById, listAlumni, setAlumniStatus, updateAlumniManagedFields } from "../db/alumni.js";
import { writeAuditLog } from "../db/auditLog.js";
import { findDepartmentById } from "../db/departments.js";
import { createPasswordReset, revokeOpenPasswordResetsForCollegeUser } from "../db/passwordResets.js";
import { revokeAllSessionsForCollegeUser } from "../db/sessions.js";
import { findTenantById } from "../db/tenants.js";
import { getEnv } from "../env.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

// Mirrors routes/students.ts deliberately -- same shape for search,
// filtering, pagination, and error handling (Part 8.2 of the plan).
export const alumniRouter = Router();

const RESET_EXPIRY_HOURS = 1; // spec 10.5, same constant as students.ts

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function queryNumber(value: unknown): number | undefined {
  const str = queryString(value);
  if (str === undefined) return undefined;
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// GET /alumni -- gated the same way GET /students is (a specific managed-
// fields permission, not a broad role check), mirrored exactly per the
// plan's pre-flight instruction.
alumniRouter.get("/", resolveSession(), requirePermission(PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  const search = queryString(req.query.search);
  const company = queryString(req.query.company);
  const departmentId = queryString(req.query.departmentId);
  const graduationYear = queryNumber(req.query.graduationYear);
  const status = queryString(req.query.status) as CollegeUserStatus | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  try {
    const result = await withTenant(pool, session.tenantId, (client) =>
      listAlumni(client, { search, company, departmentId, graduationYear, status, limit, offset }),
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("failed to list alumni", error);
    res.status(500).json({ error: "internal error" });
  }
});

// POST /alumni -- manual single add. Not explicitly requested in the
// original brief, included for parity with student onboarding (manual
// add already exists for students, via POST /invitations with
// role: "student"). Behaves the same way that path does -- creates the
// college_users row and immediately mints + sends the invitation --
// rather than leaving the row in limbo with no way to invite it later.
// Never accepts company: that field doesn't belong to college_users.
alumniRouter.post("/", resolveSession(), requirePermission(PERMISSIONS.ALUMNI_IMPORT), async (req, res) => {
  const parsed = AlumniCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }
  const { name, email, departmentId, graduationYear } = parsed.data;
  const session = req.session!;
  const pool = getPool();
  const env = getEnv();

  try {
    const result = await withTenant(pool, session.tenantId, async (client) => {
      let degreeId: string | undefined;
      let departmentName: string | undefined;
      if (departmentId !== undefined) {
        const department = await findDepartmentById(client, departmentId);
        if (!department) {
          return { kind: "invalid_department" as const };
        }
        degreeId = department.degreeId;
        departmentName = department.name;
      }

      const tenant = await findTenantById(client, session.tenantId);

      const provisioned = await provisionInvitationInTransaction(pool, client, {
        tenantId: session.tenantId,
        email,
        role: "alumni",
        name,
        degreeId,
        departmentId,
        graduationYear,
        invitedByCollegeUserId: session.collegeUserId,
      });

      return { kind: "ok" as const, provisioned, departmentName, collegeName: tenant?.name };
    });

    if (result.kind === "invalid_department") {
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
      role: "alumni",
      collegeName: result.collegeName,
      alumnus: { name, departmentName: result.departmentName ?? null, graduationYear: graduationYear ?? null },
    });

    res.status(201).json({ status: "invited" });
  } catch (error) {
    console.error("failed to add alumnus", error);
    res.status(500).json({ error: "internal error" });
  }
});

alumniRouter.get("/:id", resolveSession(), requirePermission(PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS), async (req, res) => {
  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  try {
    const alumnus = await withTenant(pool, session.tenantId, (client) => findAlumniById(client, id));
    if (!alumnus) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(200).json(alumnus);
  } catch (error) {
    console.error("failed to load alumnus", error);
    res.status(500).json({ error: "internal error" });
  }
});

alumniRouter.patch("/:id", resolveSession(), requirePermission(PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS), async (req, res) => {
  const parsed = AlumniEditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }

  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      const existing = await findAlumniById(client, id);
      if (!existing) {
        return { kind: "not_found" as const };
      }

      // degreeId is always derived server-side from departmentId, never
      // accepted independently -- same principle as students.ts's PATCH.
      let degreeId: string | undefined;
      if (parsed.data.departmentId !== undefined) {
        const department = await findDepartmentById(client, parsed.data.departmentId);
        if (!department) {
          return { kind: "invalid_department" as const };
        }
        degreeId = department.degreeId;
      }

      await updateAlumniManagedFields(client, id, {
        name: parsed.data.name,
        degreeId,
        departmentId: parsed.data.departmentId,
        graduationYear: parsed.data.graduationYear,
      });

      await writeAuditLog(client, {
        tenantId: session.tenantId,
        actorCollegeUserId: session.collegeUserId,
        action: "alumni.editManagedFields",
        targetType: "college_user",
        targetId: id,
        ipAddress: req.ip ?? null,
      });

      return { kind: "ok" as const };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }
    if (outcome.kind === "invalid_department") {
      res.status(400).json({ error: "department not found in this college's hierarchy" });
      return;
    }

    res.status(200).json({ status: "updated" });
  } catch (error) {
    console.error("failed to update alumnus", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Bidirectional (active <-> deactivated), mirroring students.ts's status endpoint exactly.
alumniRouter.patch("/:id/status", resolveSession(), requirePermission(PERMISSIONS.ALUMNI_DEACTIVATE), async (req, res) => {
  const parsed = AlumniStatusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }

  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      const existing = await findAlumniById(client, id);
      if (!existing) {
        return { kind: "not_found" as const };
      }

      await setAlumniStatus(client, id, parsed.data.status);

      if (parsed.data.status === "deactivated") {
        await revokeAllSessionsForCollegeUser(client, id);
      }

      await writeAuditLog(client, {
        tenantId: session.tenantId,
        actorCollegeUserId: session.collegeUserId,
        action: parsed.data.status === "deactivated" ? "alumni.deactivate" : "alumni.reactivate",
        targetType: "college_user",
        targetId: id,
        ipAddress: req.ip ?? null,
      });

      return { kind: "ok" as const };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }

    res.status(200).json({ status: parsed.data.status });
  } catch (error) {
    console.error("failed to update alumnus status", error);
    res.status(500).json({ error: "internal error" });
  }
});

// Identical shape to /students/:id/trigger-reset -- sends a reset email, never sets a password directly.
alumniRouter.post("/:id/trigger-reset", resolveSession(), requirePermission(PERMISSIONS.PASSWORD_TRIGGER_RESET), async (req, res) => {
  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();
  const env = getEnv();

  try {
    const outcome = await withTenant(pool, session.tenantId, async (client) => {
      const alumnus = await findAlumniById(client, id);
      if (!alumnus) {
        return { kind: "not_found" as const };
      }

      const rawToken = generateRawToken();
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000);

      await revokeOpenPasswordResetsForCollegeUser(client, id);
      await createPasswordReset(client, { tenantId: session.tenantId, collegeUserId: id, tokenHash, expiresAt });

      await writeAuditLog(client, {
        tenantId: session.tenantId,
        actorCollegeUserId: session.collegeUserId,
        action: "password.triggerReset",
        targetType: "college_user",
        targetId: id,
        ipAddress: req.ip ?? null,
      });

      return { kind: "ok" as const, email: alumnus.email, rawToken };
    });

    if (outcome.kind === "not_found") {
      res.status(404).json({ error: "not found" });
      return;
    }

    const resetUrl = `${env.WEB_APP_URL}/reset-password?token=${encodeCompoundToken(session.tenantId, outcome.rawToken)}`;
    await sendPasswordResetEmail({ to: outcome.email, resetUrl });

    res.status(200).json({ status: "reset triggered" });
  } catch (error) {
    console.error("failed to trigger password reset", error);
    res.status(500).json({ error: "internal error" });
  }
});
