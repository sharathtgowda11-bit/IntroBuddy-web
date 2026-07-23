import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { APP_URL, createFixtureDepartment, createFixtureTenant, SUPERUSER_URL, uniqueSuffix } from "@introbuddy/db";
import { Client, Pool } from "pg";
import request from "supertest";
import { createApp } from "../app.js";
import { createFixtureActor } from "../testHelpers/actors.js";

/**
 * Milestone 4's import-jobs surface: upload -> map -> validate -> preview
 * errors -> commit/send-invitations gating. The actual student-creation
 * and email-sending side effects of commit/send-invitations only happen
 * once apps/worker picks the enqueued job up (a separate milestone step),
 * so this file only verifies what apps/api itself is responsible for:
 * the synchronous upload/mapping/validation pipeline, and that commit/
 * send-invitations enqueue correctly and idempotently.
 */

const app = createApp();
const GRADUATION_YEAR = new Date().getFullYear() + 1;

interface Ctx {
  superuser: Client;
  pool: Pool;
  tenantId: string;
  senderAuthHeader: string;
  studentAuthHeader: string;
  departmentName: string;
}

async function setUp(): Promise<Ctx> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  const { id: tenantId } = await createFixtureTenant(superuser, `Import E2E Tenant ${uniqueSuffix()}`);
  const sender = await createFixtureActor(superuser, pool, tenantId, { role: "college_admin" });
  const student = await createFixtureActor(superuser, pool, tenantId, { role: "student" });
  const { name: departmentName } = await createFixtureDepartment(superuser, tenantId);

  return {
    superuser,
    pool,
    tenantId,
    senderAuthHeader: sender.authHeader,
    studentAuthHeader: student.authHeader,
    departmentName,
  };
}

async function tearDown(ctx: Ctx): Promise<void> {
  await ctx.pool.end();
  await ctx.superuser.end();
}

function buildCsv(ctx: Ctx, suffix: string): Buffer {
  const header = "Name,USN,Email,Department,Graduation Year";
  const rows = [
    `Alice Alpha,USN-${suffix}-1,alice-${suffix}@example.com,${ctx.departmentName},${GRADUATION_YEAR}`,
    `Bob Beta,USN-${suffix}-2,bob-${suffix}@example.com,${ctx.departmentName},${GRADUATION_YEAR}`,
    // missing email
    `Carol Gamma,USN-${suffix}-3,,${ctx.departmentName},${GRADUATION_YEAR}`,
    // unknown department
    `Dave Delta,USN-${suffix}-4,dave-${suffix}@example.com,No Such Department,${GRADUATION_YEAR}`,
    // implausible graduation year
    `Eve Epsilon,USN-${suffix}-5,eve-${suffix}@example.com,${ctx.departmentName},1500`,
  ];
  return Buffer.from([header, ...rows].join("\n"), "utf-8");
}

test("upload -> map -> validate -> errors.csv -> commit/send-invitations gating", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    const csv = buildCsv(ctx, suffix);

    const uploadResponse = await request(app)
      .post("/import-jobs")
      .set("Authorization", ctx.senderAuthHeader)
      .attach("file", csv, "students.csv");
    assert.equal(uploadResponse.status, 201);
    assert.equal(uploadResponse.body.rowCount, 5);
    assert.equal(uploadResponse.body.columnMapping.email, "Email");
    assert.equal(uploadResponse.body.columnMapping.department, "Department");
    const importJobId: string = uploadResponse.body.id;

    // Committing before validation is rejected.
    const commitTooEarly = await request(app)
      .post(`/import-jobs/${importJobId}/commit`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({});
    assert.equal(commitTooEarly.status, 409);

    const mappingResponse = await request(app)
      .patch(`/import-jobs/${importJobId}/mapping`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({ columnMapping: uploadResponse.body.columnMapping });
    assert.equal(mappingResponse.status, 200);

    const { rows: presetRows } = await ctx.superuser.query(
      `select column_mapping from public.import_mapping_presets where tenant_id = $1`,
      [ctx.tenantId],
    );
    assert.equal(presetRows.length, 1);
    assert.equal(presetRows[0].column_mapping.email, "Email");

    const validateResponse = await request(app)
      .post(`/import-jobs/${importJobId}/validate`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({});
    assert.equal(validateResponse.status, 200);
    assert.equal(validateResponse.body.rowCount, 5);
    assert.equal(validateResponse.body.createCount, 2);
    assert.equal(validateResponse.body.updateCount, 0);
    assert.equal(validateResponse.body.invalidCount, 3);
    assert.equal(validateResponse.body.validCount, 2);

    const statusResponse = await request(app)
      .get(`/import-jobs/${importJobId}`)
      .set("Authorization", ctx.senderAuthHeader);
    assert.equal(statusResponse.status, 200);
    assert.equal(statusResponse.body.phase, "validated");
    assert.equal(statusResponse.body.invalidCount, 3);

    const errorsCsvResponse = await request(app)
      .get(`/import-jobs/${importJobId}/errors.csv`)
      .set("Authorization", ctx.senderAuthHeader);
    assert.equal(errorsCsvResponse.status, 200);
    assert.match(errorsCsvResponse.headers["content-type"], /text\/csv/);
    assert.match(errorsCsvResponse.text, /missing email/);
    assert.match(errorsCsvResponse.text, /not found in this college's hierarchy/);
    assert.match(errorsCsvResponse.text, /graduation year out of plausible range/);

    // Commit is now allowed, and idempotent -- a repeat click enqueues no second job row.
    const firstCommit = await request(app)
      .post(`/import-jobs/${importJobId}/commit`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({});
    assert.equal(firstCommit.status, 202);

    const secondCommit = await request(app)
      .post(`/import-jobs/${importJobId}/commit`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({});
    assert.equal(secondCommit.status, 202);

    const { rows: jobRows } = await ctx.superuser.query(
      `select count(*) from public.jobs where tenant_id = $1 and type = 'import.commit' and idempotency_key = $2`,
      [ctx.tenantId, importJobId],
    );
    assert.equal(jobRows[0].count, "1");

    // No students have actually been committed yet (that's the worker's
    // job), so the live pending-invitation count is still 0 -- asking to
    // send to 2 recipients is stale and must be rejected.
    const sendDrift = await request(app)
      .post(`/import-jobs/${importJobId}/send-invitations`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({ expectedCount: 2 });
    assert.equal(sendDrift.status, 409);
    assert.equal(sendDrift.body.actualCount, 0);

    const sendMatching = await request(app)
      .post(`/import-jobs/${importJobId}/send-invitations`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({ expectedCount: 0 });
    assert.equal(sendMatching.status, 202);
  } finally {
    await tearDown(ctx);
  }
});

test("a student cannot upload an import file", async () => {
  const ctx = await setUp();
  try {
    const response = await request(app)
      .post("/import-jobs")
      .set("Authorization", ctx.studentAuthHeader)
      .attach("file", Buffer.from("Name,USN,Email,Department,Graduation Year\n", "utf-8"), "students.csv");
    assert.equal(response.status, 403);
  } finally {
    await tearDown(ctx);
  }
});

test("operations on a nonexistent import job return 404", async () => {
  const ctx = await setUp();
  try {
    const missingId = randomUUID();

    const getResponse = await request(app).get(`/import-jobs/${missingId}`).set("Authorization", ctx.senderAuthHeader);
    assert.equal(getResponse.status, 404);

    const validateResponse = await request(app)
      .post(`/import-jobs/${missingId}/validate`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({});
    assert.equal(validateResponse.status, 404);

    const commitResponse = await request(app)
      .post(`/import-jobs/${missingId}/commit`)
      .set("Authorization", ctx.senderAuthHeader)
      .send({});
    assert.equal(commitResponse.status, 404);
  } finally {
    await tearDown(ctx);
  }
});
