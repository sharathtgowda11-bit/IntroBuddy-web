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
import { claimNextJob, createImportJob, enqueueJob, findImportJobById, uploadImportFile } from "@introbuddy/jobs";
import { Client, Pool } from "pg";
import { clearMailpit, waitForEmailTo } from "../testHelpers/mailpit.js";
import { processImportCommit } from "./importCommit.js";

const GRADUATION_YEAR = new Date().getFullYear() + 1;

interface Ctx {
  superuser: Client;
  pool: Pool;
  tenantId: string;
  senderCollegeUserId: string;
  senderEmail: string;
  departmentId: string;
  departmentName: string;
}

async function setUp(): Promise<Ctx> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  // claim_next_job deliberately bypasses tenant scoping and grabs the
  // oldest queued job of a matching type, full stop -- including queued
  // jobs apps/api's own e2e tests enqueue via POST /import-jobs/:id/commit
  // and never process (no worker runs during that suite). Without this,
  // runCommit() below can claim someone else's stale leftover job instead
  // of the one it just enqueued. Same root cause and fix as
  // packages/db/src/studentImport.isolation.test.ts's own cleanup.
  await superuser.query("delete from public.jobs where status = 'queued'");

  const { id: tenantId } = await createFixtureTenant(superuser, `Worker Commit E2E Tenant ${uniqueSuffix()}`);
  const { collegeUserId: senderCollegeUserId, email: senderEmail } = await createFixtureCollegeUser(superuser, {
    tenantId,
    role: "college_admin",
    status: "active",
  });
  const { departmentId, name: departmentName } = await createFixtureDepartment(superuser, tenantId);

  return { superuser, pool, tenantId, senderCollegeUserId, senderEmail, departmentId, departmentName };
}

async function tearDown(ctx: Ctx): Promise<void> {
  await ctx.pool.end();
  await ctx.superuser.end();
}

const COLUMN_MAPPING = {
  name: "Name",
  usn: "USN",
  email: "Email",
  department: "Department",
  graduationYear: "Graduation Year",
};

/** Creates an import_jobs row plus its uploaded file in storage -- the worker's own starting point, bypassing apps/api's HTTP routes entirely (this test is about the worker, not the routes). */
async function createFixtureImportJob(ctx: Ctx, csv: string): Promise<string> {
  const importJobId = randomUUID();
  const buffer = Buffer.from(csv, "utf-8");
  const fileSha256 = createHash("sha256").update(buffer).digest("hex");
  const filePath = await uploadImportFile(ctx.tenantId, importJobId, buffer, "text/csv", "csv");

  await withTenant(ctx.pool, ctx.tenantId, (client) =>
    createImportJob(client, {
      id: importJobId,
      tenantId: ctx.tenantId,
      createdByCollegeUserId: ctx.senderCollegeUserId,
      originalFilename: "students.csv",
      filePath,
      fileSha256,
      columnMapping: COLUMN_MAPPING,
    }),
  );

  return importJobId;
}

async function runCommit(ctx: Ctx, importJobId: string) {
  await withTenant(ctx.pool, ctx.tenantId, (client) =>
    enqueueJob(client, {
      tenantId: ctx.tenantId,
      type: "import.commit",
      idempotencyKey: importJobId,
      payload: { importJobId },
    }),
  );
  const job = await claimNextJob(ctx.pool, ["import.commit"]);
  assert.ok(job, "expected the just-enqueued import.commit job to be claimable");
  await processImportCommit(ctx.pool, job);
  return job;
}

test("committing a file creates valid rows and skips invalid ones", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    const header = "Name,USN,Email,Department,Graduation Year";
    const rows = [
      `Alice Alpha,USN-${suffix}-1,alice-${suffix}@example.com,${ctx.departmentName},${GRADUATION_YEAR}`,
      `Bob Beta,USN-${suffix}-2,bob-${suffix}@example.com,${ctx.departmentName},${GRADUATION_YEAR}`,
      // missing email -- must be skipped, never committed
      `Carol Gamma,USN-${suffix}-3,,${ctx.departmentName},${GRADUATION_YEAR}`,
      // unknown department -- must be skipped
      `Dave Delta,USN-${suffix}-4,dave-${suffix}@example.com,No Such Department,${GRADUATION_YEAR}`,
    ];
    const importJobId = await createFixtureImportJob(ctx, [header, ...rows].join("\n"));

    await clearMailpit();
    await runCommit(ctx, importJobId);

    // Spec's Message 4 -- sent once the commit job reaches its final chunk.
    const summaryEmail = await waitForEmailTo(ctx.senderEmail);
    assert.match(summaryEmail, /Created:\s*2/);
    assert.match(summaryEmail, /Updated:\s*0/);
    assert.match(summaryEmail, /Skipped:\s*2/);
    assert.match(summaryEmail, /No invitation emails have been sent yet/);

    const { rows: created } = await ctx.superuser.query<{
      email: string;
      degree_id: string;
      department_id: string;
      graduation_year: number;
      source_import_job_id: string;
      status: string;
    }>(
      `select email, degree_id, department_id, graduation_year, source_import_job_id, status
       from public.college_users where tenant_id = $1 and role = 'student' order by email`,
      [ctx.tenantId],
    );
    assert.equal(created.length, 2);
    for (const row of created) {
      assert.equal(row.department_id, ctx.departmentId);
      assert.equal(row.graduation_year, GRADUATION_YEAR);
      assert.equal(row.source_import_job_id, importJobId);
      assert.equal(row.status, "invited");
      assert.ok(row.degree_id, "degree_id must be derived server-side");
    }

    const importJob = await withTenant(ctx.pool, ctx.tenantId, (client) => findImportJobById(client, importJobId));
    assert.equal(importJob?.phase, "committed");
    assert.equal(importJob?.committedRowCount, 2);

    const { rows: jobRows } = await ctx.superuser.query(`select status from public.jobs where idempotency_key = $1`, [
      importJobId,
    ]);
    assert.equal(jobRows[0].status, "succeeded");
  } finally {
    await tearDown(ctx);
  }
});

test("re-uploading a file with an existing USN updates that student instead of duplicating them", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    const usn = `USN-${suffix}-1`;
    const header = "Name,USN,Email,Department,Graduation Year";

    const firstImportJobId = await createFixtureImportJob(
      ctx,
      [header, `Alice Alpha,${usn},alice-${suffix}@example.com,${ctx.departmentName},${GRADUATION_YEAR}`].join("\n"),
    );
    await runCommit(ctx, firstImportJobId);

    const { departmentId: newDepartmentId, name: newDepartmentName } = await createFixtureDepartment(
      ctx.superuser,
      ctx.tenantId,
    );
    const newGraduationYear = GRADUATION_YEAR + 1;

    const secondImportJobId = await createFixtureImportJob(
      ctx,
      [
        header,
        // same USN, corrected department/year -- must update, not duplicate
        `Alice A. Alpha,${usn},alice-${suffix}@example.com,${newDepartmentName},${newGraduationYear}`,
        // a genuinely new student in the same file
        `Zack Zeta,USN-${suffix}-2,zack-${suffix}@example.com,${ctx.departmentName},${GRADUATION_YEAR}`,
      ].join("\n"),
    );
    await runCommit(ctx, secondImportJobId);

    const { rows: matching } = await ctx.superuser.query(
      `select department_id, graduation_year, source_import_job_id from public.college_users
       where tenant_id = $1 and usn = $2`,
      [ctx.tenantId, usn],
    );
    assert.equal(matching.length, 1, "must not duplicate the existing student");
    assert.equal(matching[0].department_id, newDepartmentId);
    assert.equal(matching[0].graduation_year, newGraduationYear);
    // Updates don't reassign provenance -- this student is still "from" the first import.
    assert.equal(matching[0].source_import_job_id, firstImportJobId);

    const { rows: all } = await ctx.superuser.query(
      `select count(*) from public.college_users where tenant_id = $1 and role = 'student'`,
      [ctx.tenantId],
    );
    assert.equal(all[0].count, "2");

    const secondImportJob = await withTenant(ctx.pool, ctx.tenantId, (client) =>
      findImportJobById(client, secondImportJobId),
    );
    assert.equal(secondImportJob?.phase, "committed");
    assert.equal(secondImportJob?.committedRowCount, 2); // one update + one create
  } finally {
    await tearDown(ctx);
  }
});

test("processing the same commit job twice is a safe no-op", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    const header = "Name,USN,Email,Department,Graduation Year";
    const importJobId = await createFixtureImportJob(
      ctx,
      [header, `Alice Alpha,USN-${suffix}-1,alice-${suffix}@example.com,${ctx.departmentName},${GRADUATION_YEAR}`].join(
        "\n",
      ),
    );

    const job = await runCommit(ctx, importJobId);
    // Re-run the exact same job payload directly (simulating a worker
    // restart that re-delivers the same claimed job, or an operator
    // manually re-triggering it) -- resolveCollegeUserForInvite's own
    // find-existing-by-email check must make this a no-op.
    await processImportCommit(ctx.pool, job);

    const { rows } = await ctx.superuser.query(
      `select count(*) from public.college_users where tenant_id = $1 and role = 'student'`,
      [ctx.tenantId],
    );
    assert.equal(rows[0].count, "1");
  } finally {
    await tearDown(ctx);
  }
});
