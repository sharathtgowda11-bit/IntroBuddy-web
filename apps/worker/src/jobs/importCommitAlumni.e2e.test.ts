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

  // Same reasoning as importCommit.e2e.test.ts's setUp: claim_next_job
  // bypasses tenant scoping, so a stale queued job from another suite
  // could otherwise be claimed instead of the one this test just enqueued.
  await superuser.query("delete from public.jobs where status = 'queued'");

  const { id: tenantId } = await createFixtureTenant(superuser, `Worker Alumni Commit E2E Tenant ${uniqueSuffix()}`);
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

const ALUMNI_COLUMN_MAPPING = {
  name: "Name",
  email: "Email",
  company: "Company",
  department: "Department",
  graduationYear: "Graduation Year",
};

/** Alumni counterpart to importCommit.e2e.test.ts's createFixtureImportJob -- bypasses apps/api's HTTP routes, targeting the worker directly. */
async function createFixtureAlumniImportJob(ctx: Ctx, csv: string): Promise<string> {
  const importJobId = randomUUID();
  const buffer = Buffer.from(csv, "utf-8");
  const fileSha256 = createHash("sha256").update(buffer).digest("hex");
  const filePath = await uploadImportFile(ctx.tenantId, importJobId, buffer, "text/csv", "csv");

  await withTenant(ctx.pool, ctx.tenantId, (client) =>
    createImportJob(client, {
      id: importJobId,
      tenantId: ctx.tenantId,
      createdByCollegeUserId: ctx.senderCollegeUserId,
      originalFilename: "alumni.csv",
      filePath,
      fileSha256,
      columnMapping: ALUMNI_COLUMN_MAPPING,
      targetRole: "alumni",
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

test("committing an alumni import creates role='alumni' rows with usn=null and no alumni_profiles row", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    const header = "Name,Email,Company,Department,Graduation Year";
    const rows = [
      `Siri Alumna,siri-${suffix}@example.com,Acme Corp,${ctx.departmentName},${GRADUATION_YEAR}`,
      // no department/graduation year -- both optional for alumni, must still commit
      `Rahul Noinfo,rahul-noinfo-${suffix}@example.com,Globex,,`,
      // missing company -- required for the import to validate, must be skipped
      `Missing Company,missing-${suffix}@example.com,,${ctx.departmentName},${GRADUATION_YEAR}`,
    ];
    const importJobId = await createFixtureAlumniImportJob(ctx, [header, ...rows].join("\n"));

    await clearMailpit();
    await runCommit(ctx, importJobId);

    const summaryEmail = await waitForEmailTo(ctx.senderEmail);
    assert.match(summaryEmail, /Your alumni import for/);
    assert.match(summaryEmail, /Created:\s*2/);
    assert.match(summaryEmail, /Skipped:\s*1/);

    const { rows: created } = await ctx.superuser.query<{
      email: string;
      role: string;
      usn: string | null;
      status: string;
      degree_id: string | null;
      department_id: string | null;
      graduation_year: number | null;
      source_import_job_id: string;
    }>(
      `select email, role, usn, status, degree_id, department_id, graduation_year, source_import_job_id
       from public.college_users where tenant_id = $1 and role = 'alumni' order by email`,
      [ctx.tenantId],
    );
    assert.equal(created.length, 2);
    for (const row of created) {
      assert.equal(row.role, "alumni");
      assert.equal(row.usn, null);
      assert.equal(row.status, "invited");
      assert.equal(row.source_import_job_id, importJobId);
    }

    const withDept = created.find((r) => r.email.startsWith("siri"));
    assert.ok(withDept?.degree_id, "degree_id must be derived server-side when a department is supplied");
    assert.equal(withDept?.department_id, ctx.departmentId);
    assert.equal(withDept?.graduation_year, GRADUATION_YEAR);

    const withoutDept = created.find((r) => r.email.startsWith("rahul"));
    assert.equal(withoutDept?.degree_id, null);
    assert.equal(withoutDept?.department_id, null);
    assert.equal(withoutDept?.graduation_year, null);

    // The single easiest place to accidentally reintroduce the ambiguity
    // this plan already resolved: no alumni_profiles row exists yet, and
    // the imported "company" value is nowhere in the database.
    const { rows: profiles } = await ctx.superuser.query(`select id from public.alumni_profiles where tenant_id = $1`, [
      ctx.tenantId,
    ]);
    assert.equal(profiles.length, 0);

    const importJob = await withTenant(ctx.pool, ctx.tenantId, (client) => findImportJobById(client, importJobId));
    assert.equal(importJob?.phase, "committed");
    assert.equal(importJob?.targetRole, "alumni");
    assert.equal(importJob?.committedRowCount, 2);
  } finally {
    await tearDown(ctx);
  }
});

test("re-uploading an alumni file with an existing email updates that alumnus instead of duplicating them", async () => {
  const ctx = await setUp();
  try {
    const suffix = uniqueSuffix();
    const email = `alice-${suffix}@example.com`;
    const header = "Name,Email,Company,Department,Graduation Year";

    const firstImportJobId = await createFixtureAlumniImportJob(
      ctx,
      [header, `Alice Alpha,${email},Acme Corp,${ctx.departmentName},${GRADUATION_YEAR}`].join("\n"),
    );
    await runCommit(ctx, firstImportJobId);

    const { departmentId: newDepartmentId, name: newDepartmentName } = await createFixtureDepartment(
      ctx.superuser,
      ctx.tenantId,
    );
    const newGraduationYear = GRADUATION_YEAR + 1;

    const secondImportJobId = await createFixtureAlumniImportJob(
      ctx,
      [
        header,
        // same email, corrected department/year -- must update, not duplicate
        `Alice A. Alpha,${email},Different Corp,${newDepartmentName},${newGraduationYear}`,
        // a genuinely new alumnus in the same file
        `Zack Zeta,zack-${suffix}@example.com,Acme Corp,${ctx.departmentName},${GRADUATION_YEAR}`,
      ].join("\n"),
    );
    await runCommit(ctx, secondImportJobId);

    const { rows: matching } = await ctx.superuser.query(
      `select department_id, graduation_year, source_import_job_id from public.college_users
       where tenant_id = $1 and lower(email) = lower($2)`,
      [ctx.tenantId, email],
    );
    assert.equal(matching.length, 1, "must not duplicate the existing alumnus");
    assert.equal(matching[0].department_id, newDepartmentId);
    assert.equal(matching[0].graduation_year, newGraduationYear);
    // Updates don't reassign provenance -- this alumnus is still "from" the first import.
    assert.equal(matching[0].source_import_job_id, firstImportJobId);

    const { rows: all } = await ctx.superuser.query(
      `select count(*) from public.college_users where tenant_id = $1 and role = 'alumni'`,
      [ctx.tenantId],
    );
    assert.equal(all[0].count, "2");

    // The re-import's "Different Corp" value was for validation/preview
    // only -- never written anywhere, including on update.
    const { rows: profiles } = await ctx.superuser.query(`select id from public.alumni_profiles where tenant_id = $1`, [
      ctx.tenantId,
    ]);
    assert.equal(profiles.length, 0);
  } finally {
    await tearDown(ctx);
  }
});
