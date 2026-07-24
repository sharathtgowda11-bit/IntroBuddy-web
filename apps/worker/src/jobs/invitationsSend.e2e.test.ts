import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  APP_URL,
  createFixtureCollegeUser,
  createFixtureDepartment,
  createFixtureTenant,
  SUPERUSER_URL,
  uniqueSuffix,
  withTenant,
} from "@introbuddy/db";
import { claimNextJob, createImportJob, enqueueJob, uploadImportFile } from "@introbuddy/jobs";
import { Client, Pool } from "pg";
import { clearMailpit, waitForEmailTo } from "../testHelpers/mailpit.js";
import { processInvitationsSend } from "./invitationsSend.js";

const GRADUATION_YEAR = new Date().getFullYear() + 1;

interface Ctx {
  superuser: Client;
  pool: Pool;
  tenantId: string;
  senderCollegeUserId: string;
  importJobId: string;
  departmentId: string;
  departmentName: string;
}

/** A minimal fixture import_jobs row -- college_users.source_import_job_id has a real FK to it, so one must exist even though this file never parses an actual upload. */
async function setUp(): Promise<Ctx> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  // See importCommit.e2e.test.ts's identical cleanup for why this is
  // needed: claim_next_job deliberately ignores tenant scoping and grabs
  // the oldest queued job of a matching type, including leftovers from
  // apps/api's own e2e suite, which enqueues real jobs but never
  // processes them.
  await superuser.query("delete from public.jobs where status = 'queued'");

  const { id: tenantId } = await createFixtureTenant(superuser, `Worker Send E2E Tenant ${uniqueSuffix()}`);
  const { collegeUserId: senderCollegeUserId } = await createFixtureCollegeUser(superuser, {
    tenantId,
    role: "college_admin",
    status: "active",
  });
  const { departmentId, name: departmentName } = await createFixtureDepartment(superuser, tenantId);

  const importJobId = randomUUID();
  const buffer = Buffer.from("Name,USN,Email,Department,Graduation Year\n", "utf-8");
  const filePath = await uploadImportFile(tenantId, importJobId, buffer, "text/csv", "csv");
  await withTenant(pool, tenantId, (client) =>
    createImportJob(client, {
      id: importJobId,
      tenantId,
      createdByCollegeUserId: senderCollegeUserId,
      originalFilename: "students.csv",
      filePath,
      fileSha256: createHash("sha256").update(buffer).digest("hex"),
      columnMapping: {},
    }),
  );

  return { superuser, pool, tenantId, senderCollegeUserId, importJobId, departmentId, departmentName };
}

async function tearDown(ctx: Ctx): Promise<void> {
  await ctx.pool.end();
  await ctx.superuser.end();
}

async function createFixtureImportedStudent(
  ctx: Ctx,
  email: string,
  params: { name?: string; usn?: string } = {},
): Promise<string> {
  const { rows } = await ctx.superuser.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, now(), now(), now())
     returning id`,
    [email],
  );
  const userId = rows[0].id;
  const collegeUserResult = await ctx.superuser.query<{ id: string }>(
    `insert into public.college_users
       (tenant_id, user_id, email, name, usn, role, status, department_id, graduation_year, source_import_job_id)
     values ($1, $2, $3, $4, $5, 'student', 'invited', $6, $7, $8)
     returning id`,
    [ctx.tenantId, userId, email, params.name ?? null, params.usn ?? null, ctx.departmentId, GRADUATION_YEAR, ctx.importJobId],
  );
  return collegeUserResult.rows[0].id;
}

async function runSend(ctx: Ctx) {
  await withTenant(ctx.pool, ctx.tenantId, (client) =>
    enqueueJob(client, {
      tenantId: ctx.tenantId,
      type: "invitations.send",
      idempotencyKey: ctx.importJobId,
      payload: { importJobId: ctx.importJobId },
    }),
  );
  const job = await claimNextJob(ctx.pool, ["invitations.send"]);
  assert.ok(job, "expected the just-enqueued invitations.send job to be claimable");
  await processInvitationsSend(ctx.pool, job);
  return job;
}

test("sends an invitation email to each pending student from the import", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    const emailA = `student-a-${suffix}@example.com`;
    const emailB = `student-b-${suffix}@example.com`;
    const usnA = `USN-${suffix}-A`;
    await createFixtureImportedStudent(ctx, emailA, { name: "Alice Alpha", usn: usnA });
    await createFixtureImportedStudent(ctx, emailB, { name: "Bob Beta", usn: `USN-${suffix}-B` });

    await clearMailpit();
    await runSend(ctx);

    const bodyA = await waitForEmailTo(emailA);
    const bodyB = await waitForEmailTo(emailB);
    assert.match(bodyA, /activate/);
    assert.match(bodyB, /activate/);

    // Spec's Message 2, personalized -- the student's own USN and
    // department, not the generic fallback template.
    assert.match(bodyA, new RegExp(usnA));
    assert.match(bodyA, new RegExp(ctx.departmentName));
    assert.match(bodyA, new RegExp(String(GRADUATION_YEAR)));

    const { rows } = await ctx.superuser.query(
      `select count(*) from public.invitations where tenant_id = $1 and revoked_at is null and consumed_at is null`,
      [ctx.tenantId],
    );
    assert.equal(rows[0].count, "2");
  } finally {
    await tearDown(ctx);
  }
});

test("re-running send after everyone already has a live invitation sends nothing new", async () => {
  const ctx = await setUp();
  try {
    const email = `student-${uniqueSuffix()}@example.com`;
    await createFixtureImportedStudent(ctx, email);

    await clearMailpit();
    await runSend(ctx);
    await waitForEmailTo(email);

    const { rows: beforeRows } = await ctx.superuser.query(
      `select token_hash from public.invitations where tenant_id = $1`,
      [ctx.tenantId],
    );
    assert.equal(beforeRows.length, 1);

    // Re-running immediately must find no pending candidates (the one
    // student already has a live invitation) and simply succeed as a no-op.
    await clearMailpit();
    const job = await withTenant(ctx.pool, ctx.tenantId, (client) =>
      enqueueJob(client, {
        tenantId: ctx.tenantId,
        type: "invitations.send",
        idempotencyKey: `${ctx.importJobId}-rerun`,
        payload: { importJobId: ctx.importJobId },
      }),
    );
    await processInvitationsSend(ctx.pool, job);

    const { rows: afterRows } = await ctx.superuser.query(
      `select token_hash from public.invitations where tenant_id = $1`,
      [ctx.tenantId],
    );
    assert.equal(afterRows.length, 1);
    assert.equal(afterRows[0].token_hash, beforeRows[0].token_hash);
  } finally {
    await tearDown(ctx);
  }
});
