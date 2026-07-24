import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_URL, createFixtureDepartment, createFixtureTenant, SUPERUSER_URL, uniqueSuffix } from "@introbuddy/db";
import { createIdentity, encodeCompoundToken, generateRawToken } from "@introbuddy/invitations";
import { Client, Pool } from "pg";
import request from "supertest";
import { createApp } from "../app.js";
import { setPassword } from "../lib/supabaseAuth.js";
import { createFixtureActor } from "../testHelpers/actors.js";
import { clearMailpit, extractTokenFromEmail, waitForEmailTo } from "../testHelpers/mailpit.js";

/**
 * Full invite -> activate -> login -> reset flow against the real local
 * stack (Postgres + GoTrue + Mailpit), exactly as spec section 16's
 * Milestone 2 demonstrable outcome describes: "A user can be invited,
 * activate, sign in and reset their password."
 */

const app = createApp();
const PASSWORD = "Correct-Horse-Battery-9";

interface Ctx {
  superuser: Client;
  pool: Pool;
  tenantId: string;
  tenantSlug: string;
  senderAuthHeader: string;
  departmentId: string;
}

const GRADUATION_YEAR = new Date().getFullYear() + 1;

async function setUp(): Promise<Ctx> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  // rate_limit_hits is shared, unscoped, cross-test-run state -- clear it
  // so repeated local test runs within the same window don't trip the
  // limiter and cause flaky failures unrelated to what's being tested.
  await superuser.query("delete from public.rate_limit_hits");

  const { id: tenantId, slug: tenantSlug } = await createFixtureTenant(superuser, `E2E Tenant ${uniqueSuffix()}`);
  const sender = await createFixtureActor(superuser, pool, tenantId, { role: "college_admin" });
  const { departmentId } = await createFixtureDepartment(superuser, tenantId);

  return { superuser, pool, tenantId, tenantSlug, senderAuthHeader: sender.authHeader, departmentId };
}

async function tearDown(ctx: Ctx): Promise<void> {
  await ctx.pool.end();
  await ctx.superuser.end();
}

test("full invite -> activate -> login -> reset happy path, including old-session revocation", async () => {
  const ctx = await setUp();
  try {
    const studentEmail = `student-${uniqueSuffix()}@example.com`;
    await clearMailpit();

    const inviteResponse = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({
        email: studentEmail,
        role: "student",
        usn: `USN-${uniqueSuffix()}`,
        departmentId: ctx.departmentId,
        graduationYear: GRADUATION_YEAR,
      });
    assert.equal(inviteResponse.status, 201);

    const activationEmail = await waitForEmailTo(studentEmail);
    const activationToken = extractTokenFromEmail(activationEmail);

    const activateResponse = await request(app)
      .post("/auth/activate")
      .send({ token: activationToken, password: PASSWORD, consentAccepted: true });
    assert.equal(activateResponse.status, 200);

    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: studentEmail, password: PASSWORD });
    assert.equal(loginResponse.status, 200);
    const firstSessionToken: string = loginResponse.body.token;

    // A student holds no invite permission, so this must be 403 (session
    // resolved, authorization denied) rather than 401 -- proof the
    // session itself is genuinely valid.
    const authorizedButForbidden = await request(app)
      .post("/invitations")
      .set("Authorization", `Bearer ${firstSessionToken}`)
      .send({
        email: `other-${uniqueSuffix()}@example.com`,
        role: "student",
        departmentId: ctx.departmentId,
        graduationYear: GRADUATION_YEAR,
      });
    assert.equal(authorizedButForbidden.status, 403);

    await clearMailpit();
    const resetRequestResponse = await request(app)
      .post("/auth/reset/request")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: studentEmail });
    assert.equal(resetRequestResponse.status, 200);

    const resetEmail = await waitForEmailTo(studentEmail);
    const resetToken = extractTokenFromEmail(resetEmail);

    const newPassword = "Even-Better-Passw0rd";
    const resetCompleteResponse = await request(app)
      .post("/auth/reset/complete")
      .send({ token: resetToken, password: newPassword });
    assert.equal(resetCompleteResponse.status, 200);

    // Spec 8.6: completing a reset invalidates existing sessions.
    const oldSessionNowRevoked = await request(app)
      .post("/invitations")
      .set("Authorization", `Bearer ${firstSessionToken}`)
      .send({ email: `unused-${uniqueSuffix()}@example.com`, role: "student" });
    assert.equal(oldSessionNowRevoked.status, 401);

    const loginWithNewPassword = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: studentEmail, password: newPassword });
    assert.equal(loginWithNewPassword.status, 200);
  } finally {
    await tearDown(ctx);
  }
});

test("activation rejects a token that has already been consumed", async () => {
  const ctx = await setUp();
  try {
    const studentEmail = `student-${uniqueSuffix()}@example.com`;
    await clearMailpit();

    const inviteResponse = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({ email: studentEmail, role: "student", departmentId: ctx.departmentId, graduationYear: GRADUATION_YEAR });
    assert.equal(inviteResponse.status, 201);

    const token = extractTokenFromEmail(await waitForEmailTo(studentEmail));

    const first = await request(app)
      .post("/auth/activate")
      .send({ token, password: PASSWORD, consentAccepted: true });
    assert.equal(first.status, 200);

    const second = await request(app)
      .post("/auth/activate")
      .send({ token, password: PASSWORD, consentAccepted: true });
    assert.equal(second.status, 400);
  } finally {
    await tearDown(ctx);
  }
});

test("reissuing an invitation invalidates the previous token", async () => {
  const ctx = await setUp();
  try {
    const studentEmail = `student-${uniqueSuffix()}@example.com`;

    await clearMailpit();
    const firstInviteResponse = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({ email: studentEmail, role: "student", departmentId: ctx.departmentId, graduationYear: GRADUATION_YEAR });
    assert.equal(firstInviteResponse.status, 201);
    const firstToken = extractTokenFromEmail(await waitForEmailTo(studentEmail));

    await clearMailpit();
    const reissueResponse = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({ email: studentEmail, role: "student", departmentId: ctx.departmentId, graduationYear: GRADUATION_YEAR });
    assert.equal(reissueResponse.status, 201);
    const secondToken = extractTokenFromEmail(await waitForEmailTo(studentEmail));

    const activateWithOldToken = await request(app)
      .post("/auth/activate")
      .send({ token: firstToken, password: PASSWORD, consentAccepted: true });
    assert.equal(activateWithOldToken.status, 400);

    const activateWithNewToken = await request(app)
      .post("/auth/activate")
      .send({ token: secondToken, password: PASSWORD, consentAccepted: true });
    assert.equal(activateWithNewToken.status, 200);
  } finally {
    await tearDown(ctx);
  }
});

test("student activation without consent is rejected, and the token stays valid for a retry with consent", async () => {
  const ctx = await setUp();
  try {
    const studentEmail = `student-${uniqueSuffix()}@example.com`;
    await clearMailpit();

    const inviteResponse = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({ email: studentEmail, role: "student", departmentId: ctx.departmentId, graduationYear: GRADUATION_YEAR });
    assert.equal(inviteResponse.status, 201);

    const token = extractTokenFromEmail(await waitForEmailTo(studentEmail));

    const withoutConsent = await request(app).post("/auth/activate").send({ token, password: PASSWORD });
    assert.equal(withoutConsent.status, 400);

    // The failed attempt must not have consumed the single-use token.
    await clearMailpit();
    const withConsent = await request(app)
      .post("/auth/activate")
      .send({ token, password: PASSWORD, consentAccepted: true });
    assert.equal(withConsent.status, 200);

    const { rows } = await ctx.superuser.query(
      `select c.policy_version from public.consents c
       join public.college_users cu on cu.id = c.college_user_id
       where cu.email = $1`,
      [studentEmail],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].policy_version, "1.0");

    // Message 5 -- sent once, right after the student's own activation.
    const confirmedEmail = await waitForEmailTo(studentEmail);
    assert.match(confirmedEmail, /profile/i);
  } finally {
    await tearDown(ctx);
  }
});

test("college_admin activation is unaffected by the student consent requirement", async () => {
  const ctx = await setUp();
  try {
    const adminEmail = `second-admin-${uniqueSuffix()}@example.com`;
    await clearMailpit();

    const inviteResponse = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({ email: adminEmail, role: "college_admin" });
    assert.equal(inviteResponse.status, 201);

    const token = extractTokenFromEmail(await waitForEmailTo(adminEmail));

    const activateResponse = await request(app).post("/auth/activate").send({ token, password: PASSWORD });
    assert.equal(activateResponse.status, 200);

    const { rows } = await ctx.superuser.query(
      `select c.id from public.consents c
       join public.college_users cu on cu.id = c.college_user_id
       where cu.email = $1`,
      [adminEmail],
    );
    assert.equal(rows.length, 0);
  } finally {
    await tearDown(ctx);
  }
});

test("student invitation email is personalized with USN, department, and batch", async () => {
  const ctx = await setUp();
  try {
    const studentEmail = `student-${uniqueSuffix()}@example.com`;
    const usn = `USN-${uniqueSuffix()}`;
    await clearMailpit();

    const inviteResponse = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({ email: studentEmail, role: "student", usn, departmentId: ctx.departmentId, graduationYear: GRADUATION_YEAR });
    assert.equal(inviteResponse.status, 201);

    const emailBody = await waitForEmailTo(studentEmail);
    assert.match(emailBody, new RegExp(usn));
    assert.match(emailBody, new RegExp(String(GRADUATION_YEAR)));
    assert.match(emailBody, /USN:/);
    assert.match(emailBody, /Batch:/);
  } finally {
    await tearDown(ctx);
  }
});

test("GET /session resolves the caller's own tenant, role, and identity", async () => {
  const ctx = await setUp();
  try {
    const response = await request(app).get("/auth/session").set("Authorization", ctx.senderAuthHeader);
    assert.equal(response.status, 200);
    assert.equal(response.body.tenantId, ctx.tenantId);
    assert.equal(response.body.tenantSlug, ctx.tenantSlug);
    assert.equal(response.body.role, "college_admin");

    const unauthenticated = await request(app).get("/auth/session");
    assert.equal(unauthenticated.status, 401);
  } finally {
    await tearDown(ctx);
  }
});

test("login gives an identical response for an unknown identifier and a wrong password", async () => {
  const ctx = await setUp();
  try {
    // setPassword calls GoTrue's real Admin API, which needs a user
    // provisioned through that same real API (createIdentity) -- not the
    // raw-SQL fixture shortcut used elsewhere, which only satisfies
    // college_users' FK and isn't a fully valid GoTrue user row.
    const email = `student-${uniqueSuffix()}@example.com`;
    const userId = await createIdentity(ctx.pool, email);
    await ctx.superuser.query(
      `insert into public.college_users (tenant_id, user_id, email, role, status) values ($1, $2, $3, 'student', 'active')`,
      [ctx.tenantId, userId, email],
    );
    await setPassword(userId, PASSWORD);

    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: email, password: "definitely-wrong" });

    const unknownIdentifier = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: ctx.tenantSlug, emailOrUsn: `no-such-usn-${uniqueSuffix()}`, password: "definitely-wrong" });

    assert.equal(wrongPassword.status, unknownIdentifier.status);
    assert.deepEqual(wrongPassword.body, unknownIdentifier.body);
  } finally {
    await tearDown(ctx);
  }
});

test("a session token minted under one tenant cannot authenticate against another tenant's data", async () => {
  const ctx = await setUp();
  try {
    const { id: otherTenantId } = await createFixtureTenant(ctx.superuser, `E2E Other Tenant ${uniqueSuffix()}`);

    // A genuine, validly-signed-looking session raw token, but paired
    // with a *different* tenant's id as the prefix -- simulates a
    // tampered or confused compound token.
    const tamperedToken = encodeCompoundToken(otherTenantId, generateRawToken());

    const response = await request(app)
      .post("/invitations")
      .set("Authorization", `Bearer ${tamperedToken}`)
      .send({ email: `nope-${uniqueSuffix()}@example.com`, role: "student" });

    assert.equal(response.status, 401);
  } finally {
    await tearDown(ctx);
  }
});

test("single-student add derives degree_id from departmentId server-side", async () => {
  const ctx = await setUp();
  try {
    const studentEmail = `student-${uniqueSuffix()}@example.com`;

    const response = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({ email: studentEmail, role: "student", departmentId: ctx.departmentId, graduationYear: GRADUATION_YEAR });
    assert.equal(response.status, 201);

    const { rows } = await ctx.superuser.query<{
      department_id: string;
      degree_id: string;
      graduation_year: number;
    }>(
      `select department_id, degree_id, graduation_year from public.college_users where email = $1`,
      [studentEmail],
    );
    assert.equal(rows[0].department_id, ctx.departmentId);
    assert.equal(rows[0].graduation_year, GRADUATION_YEAR);
    // degree_id was never sent by the client -- proof it was derived from departmentId, not accepted directly.
    assert.ok(rows[0].degree_id);
  } finally {
    await tearDown(ctx);
  }
});

test("single-student add rejects a departmentId belonging to a different tenant", async () => {
  const ctx = await setUp();
  try {
    const { id: otherTenantId } = await createFixtureTenant(ctx.superuser, `E2E Other Tenant ${uniqueSuffix()}`);
    const { departmentId: foreignDepartmentId } = await createFixtureDepartment(ctx.superuser, otherTenantId);

    const response = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({
        email: `student-${uniqueSuffix()}@example.com`,
        role: "student",
        departmentId: foreignDepartmentId,
        graduationYear: GRADUATION_YEAR,
      });

    assert.equal(response.status, 400);
  } finally {
    await tearDown(ctx);
  }
});

test("single-student add rejects a graduation year outside the plausible range", async () => {
  const ctx = await setUp();
  try {
    const response = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({
        email: `student-${uniqueSuffix()}@example.com`,
        role: "student",
        departmentId: ctx.departmentId,
        graduationYear: new Date().getFullYear() + 50,
      });

    assert.equal(response.status, 400);
  } finally {
    await tearDown(ctx);
  }
});

test("inviting a college_admin rejects departmentId/graduationYear as forbidden fields", async () => {
  const ctx = await setUp();
  try {
    const response = await request(app)
      .post("/invitations")
      .set("Authorization", ctx.senderAuthHeader)
      .send({
        email: `admin-${uniqueSuffix()}@example.com`,
        role: "college_admin",
        departmentId: ctx.departmentId,
        graduationYear: GRADUATION_YEAR,
      });

    assert.equal(response.status, 400);
  } finally {
    await tearDown(ctx);
  }
});
