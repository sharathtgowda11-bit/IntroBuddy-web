import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_URL,
  createFixtureCollegeUser,
  createFixtureDepartment,
  createFixtureTenant,
  SUPERUSER_URL,
  uniqueSuffix,
} from "@introbuddy/db";
import { createIdentity } from "@introbuddy/invitations";
import { Client, Pool } from "pg";
import request from "supertest";
import { createApp } from "../app.js";
import { setPassword } from "../lib/supabaseAuth.js";
import { createFixtureActor } from "../testHelpers/actors.js";
import { clearMailpit, extractTokenFromEmail, waitForEmailTo } from "../testHelpers/mailpit.js";

/**
 * Milestone 6's administration surface: search/filter/edit/deactivate
 * students, admin-triggered password reset, dashboard statistics, and the
 * audit log viewer -- the demonstrable outcome is "a placement officer
 * can manage their student body," scoped to their own college.
 */

const app = createApp();
const PASSWORD = "Correct-Horse-Battery-9";
const GRADUATION_YEAR = new Date().getFullYear() + 1;

interface Ctx {
  superuser: Client;
  pool: Pool;
  tenantId: string;
  tenantSlug: string;
  senderAuthHeader: string;
  departmentId: string;
  departmentName: string;
}

async function setUp(): Promise<Ctx> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  const { id: tenantId, slug: tenantSlug } = await createFixtureTenant(superuser, `Students E2E Tenant ${uniqueSuffix()}`);
  const sender = await createFixtureActor(superuser, pool, tenantId, { role: "college_admin" });
  const { departmentId, name: departmentName } = await createFixtureDepartment(superuser, tenantId);

  return { superuser, pool, tenantId, tenantSlug, senderAuthHeader: sender.authHeader, departmentId, departmentName };
}

async function tearDown(ctx: Ctx): Promise<void> {
  await ctx.pool.end();
  await ctx.superuser.end();
}

/** A real, loginable student -- via GoTrue's admin API, not the raw-SQL fixture shortcut (needed for setPassword/login to actually work). */
async function createLoginableStudent(
  ctx: Ctx,
  params: { usn: string; name?: string },
): Promise<{ studentId: string; email: string }> {
  const email = `student-${uniqueSuffix()}@example.com`;
  const userId = await createIdentity(ctx.pool, email);
  const { rows } = await ctx.superuser.query<{ id: string }>(
    `insert into public.college_users
       (tenant_id, user_id, email, usn, name, department_id, graduation_year, role, status)
     values ($1, $2, $3, $4, $5, $6, $7, 'student', 'active')
     returning id`,
    [ctx.tenantId, userId, email, params.usn, params.name ?? null, ctx.departmentId, GRADUATION_YEAR],
  );
  await setPassword(userId, PASSWORD);
  return { studentId: rows[0].id, email };
}

test("GET /students searches by name/usn/email, filters by department and status, scoped to the caller's own tenant", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    const { collegeUserId: aliceId } = await createFixtureCollegeUser(ctx.superuser, {
      tenantId: ctx.tenantId,
      name: `Alice Alpha ${suffix}`,
      usn: `USN-${suffix}-A`,
      status: "active",
      departmentId: ctx.departmentId,
      graduationYear: GRADUATION_YEAR,
    });
    await createFixtureCollegeUser(ctx.superuser, {
      tenantId: ctx.tenantId,
      name: `Bob Beta ${suffix}`,
      usn: `USN-${suffix}-B`,
      status: "invited",
      departmentId: ctx.departmentId,
      graduationYear: GRADUATION_YEAR,
    });

    // A same-named student in a different tenant must never appear.
    const { id: otherTenantId } = await createFixtureTenant(ctx.superuser, `Other Tenant ${uniqueSuffix()}`);
    await createFixtureCollegeUser(ctx.superuser, {
      tenantId: otherTenantId,
      name: `Alice Alpha ${suffix}`,
      usn: `USN-${suffix}-A`,
      status: "active",
    });

    const bySearch = await request(app)
      .get("/students")
      .query({ search: `Alice Alpha ${suffix}` })
      .set("Authorization", ctx.senderAuthHeader);
    assert.equal(bySearch.status, 200);
    assert.equal(bySearch.body.total, 1);
    assert.equal(bySearch.body.students[0].id, aliceId);

    const byStatus = await request(app)
      .get("/students")
      .query({ status: "invited", search: suffix })
      .set("Authorization", ctx.senderAuthHeader);
    assert.equal(byStatus.status, 200);
    assert.equal(byStatus.body.total, 1);
    assert.equal(byStatus.body.students[0].name, `Bob Beta ${suffix}`);

    const byDepartment = await request(app)
      .get("/students")
      .query({ departmentId: ctx.departmentId, search: suffix })
      .set("Authorization", ctx.senderAuthHeader);
    assert.equal(byDepartment.status, 200);
    assert.equal(byDepartment.body.total, 2);
  } finally {
    await tearDown(ctx);
  }
});

test("PATCH /students/:id edits managed fields and re-derives degreeId from departmentId", async () => {
  const ctx = await setUp();
  try {
    const { collegeUserId } = await createFixtureCollegeUser(ctx.superuser, {
      tenantId: ctx.tenantId,
      usn: `USN-${uniqueSuffix()}`,
      departmentId: ctx.departmentId,
      graduationYear: GRADUATION_YEAR,
    });
    const { departmentId: newDepartmentId, degreeId: newDegreeId } = await createFixtureDepartment(
      ctx.superuser,
      ctx.tenantId,
    );

    const patchResponse = await request(app)
      .patch(`/students/${collegeUserId}`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({ name: "Updated Name", departmentId: newDepartmentId, graduationYear: GRADUATION_YEAR + 1 });
    assert.equal(patchResponse.status, 200);

    const getResponse = await request(app).get(`/students/${collegeUserId}`).set("Authorization", ctx.senderAuthHeader);
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.name, "Updated Name");
    assert.equal(getResponse.body.departmentId, newDepartmentId);
    assert.equal(getResponse.body.degreeId, newDegreeId);
    assert.equal(getResponse.body.graduationYear, GRADUATION_YEAR + 1);
  } finally {
    await tearDown(ctx);
  }
});

test("PATCH /students/:id rejects a USN collision within the tenant", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, usn: `USN-${suffix}-A` });
    const { collegeUserId: studentB } = await createFixtureCollegeUser(ctx.superuser, {
      tenantId: ctx.tenantId,
      usn: `USN-${suffix}-B`,
    });

    const response = await request(app)
      .patch(`/students/${studentB}`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({ usn: `USN-${suffix}-A` });
    assert.equal(response.status, 409);
  } finally {
    await tearDown(ctx);
  }
});

test("deactivating a student revokes their session and blocks login; reactivating restores it", async () => {
  const ctx = await setUp();
  try {
    const { studentId, email } = await createLoginableStudent(ctx, { usn: `USN-${uniqueSuffix()}` });

    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: email, password: PASSWORD });
    assert.equal(loginResponse.status, 200);
    const sessionToken: string = loginResponse.body.token;

    const deactivateResponse = await request(app)
      .patch(`/students/${studentId}/status`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({ status: "deactivated" });
    assert.equal(deactivateResponse.status, 200);

    // The already-issued session is revoked immediately, not just future logins blocked.
    const profileWithOldSession = await request(app).get("/me/profile").set("Authorization", `Bearer ${sessionToken}`);
    assert.equal(profileWithOldSession.status, 401);

    const loginAfterDeactivate = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: email, password: PASSWORD });
    assert.equal(loginAfterDeactivate.status, 401);

    const reactivateResponse = await request(app)
      .patch(`/students/${studentId}/status`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({ status: "active" });
    assert.equal(reactivateResponse.status, 200);

    const loginAfterReactivate = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: email, password: PASSWORD });
    assert.equal(loginAfterReactivate.status, 200);
  } finally {
    await tearDown(ctx);
  }
});

test("POST /students/:id/trigger-reset sends a reset email that completes exactly like the self-service flow", async () => {
  const ctx = await setUp();
  try {
    const { studentId, email } = await createLoginableStudent(ctx, { usn: `USN-${uniqueSuffix()}` });

    await clearMailpit();
    const triggerResponse = await request(app)
      .post(`/students/${studentId}/trigger-reset`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({});
    assert.equal(triggerResponse.status, 200);

    const resetToken = extractTokenFromEmail(await waitForEmailTo(email));
    const newPassword = "Even-Better-Passw0rd";
    const completeResponse = await request(app)
      .post("/auth/reset/complete")
      .send({ token: resetToken, password: newPassword });
    assert.equal(completeResponse.status, 200);

    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: email, password: newPassword });
    assert.equal(loginResponse.status, 200);
  } finally {
    await tearDown(ctx);
  }
});

test("GET /dashboard returns aggregate counts for the caller's own tenant", async () => {
  const ctx = await setUp();
  try {
    await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, status: "active" });
    await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, status: "active" });
    await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, status: "invited" });
    const { collegeUserId: deactivatedId } = await createFixtureCollegeUser(ctx.superuser, {
      tenantId: ctx.tenantId,
      status: "deactivated",
    });
    const { collegeUserId: completeId } = await createFixtureCollegeUser(ctx.superuser, {
      tenantId: ctx.tenantId,
      status: "active",
    });
    await ctx.superuser.query(
      `insert into public.student_profiles (tenant_id, college_user_id, avatar_path, linkedin_url)
       values ($1, $2, 'fake/avatar.jpg', 'https://linkedin.com/in/example')`,
      [ctx.tenantId, completeId],
    );

    const response = await request(app).get("/dashboard").set("Authorization", ctx.senderAuthHeader);
    assert.equal(response.status, 200);
    assert.equal(response.body.totalStudents, 5);
    assert.equal(response.body.activeCount, 3);
    assert.equal(response.body.invitedCount, 1);
    assert.equal(response.body.deactivatedCount, 1);
    assert.equal(response.body.profileCompleteCount, 1);
    assert.ok(deactivatedId);
  } finally {
    await tearDown(ctx);
  }
});

test("GET /audit-log reflects administrative actions taken against a student", async () => {
  const ctx = await setUp();
  try {
    const { collegeUserId } = await createFixtureCollegeUser(ctx.superuser, {
      tenantId: ctx.tenantId,
      usn: `USN-${uniqueSuffix()}`,
    });

    const patchResponse = await request(app)
      .patch(`/students/${collegeUserId}`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({ name: "Renamed Student" });
    assert.equal(patchResponse.status, 200);

    const response = await request(app).get("/audit-log").set("Authorization", ctx.senderAuthHeader);
    assert.equal(response.status, 200);
    const entry = response.body.entries.find(
      (e: { action: string; targetId: string }) => e.action === "student.editManagedFields" && e.targetId === collegeUserId,
    );
    assert.ok(entry, "expected an audit log entry for the edit just performed");
  } finally {
    await tearDown(ctx);
  }
});

test("a student cannot access the administration routes", async () => {
  const ctx = await setUp();
  try {
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });

    const listResponse = await request(app).get("/students").set("Authorization", student.authHeader);
    assert.equal(listResponse.status, 403);

    const dashboardResponse = await request(app).get("/dashboard").set("Authorization", student.authHeader);
    assert.equal(dashboardResponse.status, 403);

    const auditLogResponse = await request(app).get("/audit-log").set("Authorization", student.authHeader);
    assert.equal(auditLogResponse.status, 403);
  } finally {
    await tearDown(ctx);
  }
});
