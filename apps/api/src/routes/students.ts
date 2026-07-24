import { getPool, withTenant } from "@introbuddy/db";
import { encodeCompoundToken, findCollegeUserByUsn, generateRawToken, hashToken } from "@introbuddy/invitations";
import { PERMISSIONS, StudentEditSchema, StudentStatusUpdateSchema, type CollegeUserStatus } from "@introbuddy/shared";
import { Router } from "express";
import { writeAuditLog } from "../db/auditLog.js";
import { findDepartmentById } from "../db/departments.js";
import { createPasswordReset, revokeOpenPasswordResetsForCollegeUser } from "../db/passwordResets.js";
import { revokeAllSessionsForCollegeUser } from "../db/sessions.js";
import { findStudentById, listStudents, setStudentStatus, updateStudentManagedFields } from "../db/students.js";
import { getEnv } from "../env.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const studentsRouter = Router();

const RESET_EXPIRY_HOURS = 1; // spec 10.5, same constant as auth.ts's self-service reset

function queryString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

studentsRouter.get("/", resolveSession(), requirePermission(PERMISSIONS.STUDENT_EDIT_MANAGED_FIELDS), async (req, res) => {
  const session = req.session!;
  const pool = getPool();

  const search = queryString(req.query.search);
  const departmentId = queryString(req.query.departmentId);
  const degreeId = queryString(req.query.degreeId);
  const status = queryString(req.query.status) as CollegeUserStatus | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  try {
    const result = await withTenant(pool, session.tenantId, (client) =>
      listStudents(client, { search, departmentId, degreeId, status, limit, offset }),
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("failed to list students", error);
    res.status(500).json({ error: "internal error" });
  }
});

studentsRouter.get(
  "/:id",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_EDIT_MANAGED_FIELDS),
  async (req, res) => {
    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const student = await withTenant(pool, session.tenantId, (client) => findStudentById(client, id));
      if (!student) {
        res.status(404).json({ error: "not found" });
        return;
      }
      res.status(200).json(student);
    } catch (error) {
      console.error("failed to load student", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

studentsRouter.patch(
  "/:id",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_EDIT_MANAGED_FIELDS),
  async (req, res) => {
    const parsed = StudentEditSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const outcome = await withTenant(pool, session.tenantId, async (client) => {
        const existing = await findStudentById(client, id);
        if (!existing) {
          return { kind: "not_found" as const };
        }

        if (parsed.data.usn !== undefined) {
          const usnConflict = await findCollegeUserByUsn(client, parsed.data.usn);
          if (usnConflict && usnConflict.id !== id) {
            return { kind: "usn_conflict" as const };
          }
        }

        // degreeId is always derived server-side from departmentId, never
        // accepted independently -- same principle as invitations.ts's
        // single-add fix (Milestone 4).
        let degreeId: string | undefined;
        if (parsed.data.departmentId !== undefined) {
          const department = await findDepartmentById(client, parsed.data.departmentId);
          if (!department) {
            return { kind: "invalid_department" as const };
          }
          degreeId = department.degreeId;
        }

        await updateStudentManagedFields(client, id, {
          name: parsed.data.name,
          usn: parsed.data.usn,
          degreeId,
          departmentId: parsed.data.departmentId,
          graduationYear: parsed.data.graduationYear,
        });

        await writeAuditLog(client, {
          tenantId: session.tenantId,
          actorCollegeUserId: session.collegeUserId,
          action: "student.editManagedFields",
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
      if (outcome.kind === "usn_conflict") {
        res.status(409).json({ error: "USN already in use by another student in this college" });
        return;
      }
      if (outcome.kind === "invalid_department") {
        res.status(400).json({ error: "department not found in this college's hierarchy" });
        return;
      }

      res.status(200).json({ status: "updated" });
    } catch (error) {
      console.error("failed to update student", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

// Bidirectional (active <-> deactivated) so this one endpoint covers both
// deactivating and reactivating -- spec never mentions "reactivate"
// separately, but a one-way endpoint would leave no way back.
studentsRouter.patch(
  "/:id/status",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_DEACTIVATE),
  async (req, res) => {
    const parsed = StudentStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const outcome = await withTenant(pool, session.tenantId, async (client) => {
        const existing = await findStudentById(client, id);
        if (!existing) {
          return { kind: "not_found" as const };
        }

        await setStudentStatus(client, id, parsed.data.status);

        if (parsed.data.status === "deactivated") {
          // An already-logged-in student must be logged out immediately,
          // not just blocked from a future login -- same reasoning as
          // spec 8.6's password-reset session revocation.
          await revokeAllSessionsForCollegeUser(client, id);
        }

        await writeAuditLog(client, {
          tenantId: session.tenantId,
          actorCollegeUserId: session.collegeUserId,
          action: parsed.data.status === "deactivated" ? "student.deactivate" : "student.reactivate",
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
      console.error("failed to update student status", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

// Distinct from the unauthenticated /auth/reset/request self-service flow:
// this is the college_admin-triggers-for-a-student half of
// PASSWORD_TRIGGER_RESET, going straight to a known :id rather than an
// email/USN lookup. Reuses the exact same token-mint + email machinery.
studentsRouter.post(
  "/:id/trigger-reset",
  resolveSession(),
  requirePermission(PERMISSIONS.PASSWORD_TRIGGER_RESET),
  async (req, res) => {
    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();
    const env = getEnv();

    try {
      const outcome = await withTenant(pool, session.tenantId, async (client) => {
        const student = await findStudentById(client, id);
        if (!student) {
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

        return { kind: "ok" as const, email: student.email, rawToken };
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
  },
);
