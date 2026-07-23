import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, Pool } from "pg";
import { APP_URL, createFixtureCollegeUser, createFixtureTenant, SUPERUSER_URL } from "./testFixtures.js";
import { withTenant } from "./withTenant.js";

/**
 * Extends the section 6.6 isolation test to the four tables Milestone 4
 * adds: import_mapping_presets, import_jobs, import_errors, jobs. Same
 * FORCE ROW LEVEL SECURITY + tenant_isolation policy as every other
 * tenant-scoped table. The final test in this file is the one
 * deliberate, documented exception: claim_next_job() must see across
 * tenants for the worker's poll loop to function at all -- contrasted
 * directly against jobs' own ordinary tenant-scoped read, which is
 * isolated exactly like everything else.
 */

interface Fixtures {
  superuser: Client;
  pool: Pool;
  tenantAId: string;
  tenantBId: string;
  collegeUserAId: string;
  collegeUserBId: string;
}

async function setUp(): Promise<Fixtures> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  const { id: tenantAId } = await createFixtureTenant(superuser, "Student Import Isolation Tenant A");
  const { id: tenantBId } = await createFixtureTenant(superuser, "Student Import Isolation Tenant B");
  const { collegeUserId: collegeUserAId } = await createFixtureCollegeUser(superuser, { tenantId: tenantAId });
  const { collegeUserId: collegeUserBId } = await createFixtureCollegeUser(superuser, { tenantId: tenantBId });

  return { superuser, pool, tenantAId, tenantBId, collegeUserAId, collegeUserBId };
}

async function tearDown(f: Fixtures): Promise<void> {
  await f.pool.end();
  await f.superuser.end();
}

test("an import_mapping_presets row scoped to tenant A never returns tenant B's row", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(`insert into public.import_mapping_presets (tenant_id, column_mapping) values ($1, '{"usn":"USN"}')`, [
      f.tenantAId,
    ]);
    await f.superuser.query(`insert into public.import_mapping_presets (tenant_id, column_mapping) values ($1, '{"usn":"Roll No"}')`, [
      f.tenantBId,
    ]);

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.import_mapping_presets"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.import_mapping_presets");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("an import_jobs row scoped to tenant A never returns tenant B's row", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(
      `insert into public.import_jobs (tenant_id, created_by_college_user_id, original_filename, file_path, file_sha256)
       values ($1, $2, 'students.csv', 'path/a.csv', 'hash-a')`,
      [f.tenantAId, f.collegeUserAId],
    );
    await f.superuser.query(
      `insert into public.import_jobs (tenant_id, created_by_college_user_id, original_filename, file_path, file_sha256)
       values ($1, $2, 'students.csv', 'path/b.csv', 'hash-b')`,
      [f.tenantBId, f.collegeUserBId],
    );

    const seenAsTenantB = await withTenant(f.pool, f.tenantBId, (client) =>
      client.query("select tenant_id from public.import_jobs"),
    );
    assert.equal(seenAsTenantB.rows.length, 1);
    assert.equal(seenAsTenantB.rows[0].tenant_id, f.tenantBId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.import_jobs");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("an import_errors row scoped to tenant A never returns tenant B's row", async () => {
  const f = await setUp();
  try {
    const jobA = await f.superuser.query<{ id: string }>(
      `insert into public.import_jobs (tenant_id, created_by_college_user_id, original_filename, file_path, file_sha256)
       values ($1, $2, 'students.csv', 'path/a.csv', 'hash-a') returning id`,
      [f.tenantAId, f.collegeUserAId],
    );
    const jobB = await f.superuser.query<{ id: string }>(
      `insert into public.import_jobs (tenant_id, created_by_college_user_id, original_filename, file_path, file_sha256)
       values ($1, $2, 'students.csv', 'path/b.csv', 'hash-b') returning id`,
      [f.tenantBId, f.collegeUserBId],
    );

    await f.superuser.query(
      `insert into public.import_errors (tenant_id, import_job_id, row_number, raw_row, error_reason)
       values ($1, $2, 1, '{}', 'bad email')`,
      [f.tenantAId, jobA.rows[0].id],
    );
    await f.superuser.query(
      `insert into public.import_errors (tenant_id, import_job_id, row_number, raw_row, error_reason)
       values ($1, $2, 1, '{}', 'bad email')`,
      [f.tenantBId, jobB.rows[0].id],
    );

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.import_errors"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.import_errors");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("a jobs row scoped to tenant A never returns tenant B's row via an ordinary tenant-scoped read", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(`insert into public.jobs (tenant_id, type, idempotency_key) values ($1, 'import.commit', 'key-a')`, [
      f.tenantAId,
    ]);
    await f.superuser.query(`insert into public.jobs (tenant_id, type, idempotency_key) values ($1, 'import.commit', 'key-b')`, [
      f.tenantBId,
    ]);

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) => client.query("select tenant_id from public.jobs"));
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.jobs");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("claim_next_job deliberately sees across tenants -- the one narrow exception to the isolation guarantee above", async () => {
  const f = await setUp();
  try {
    // claim_next_job is the one function in this codebase that
    // deliberately doesn't respect tenant scoping, so unlike every other
    // isolation test here, it's vulnerable to queued jobs left behind by
    // other tests/runs (nothing else in this suite ever cleans up its
    // own fixture rows, since every other query IS properly tenant-scoped
    // and leftovers can't interfere with it). Clear the slate so this
    // test's "no more queued jobs" assertion is reliable regardless of
    // execution order.
    await f.superuser.query("delete from public.jobs where status = 'queued'");

    await f.superuser.query(`insert into public.jobs (tenant_id, type, idempotency_key) values ($1, 'import.commit', 'claim-key-a')`, [
      f.tenantAId,
    ]);
    await f.superuser.query(
      `insert into public.jobs (tenant_id, type, idempotency_key) values ($1, 'invitations.send', 'claim-key-b')`,
      [f.tenantBId],
    );

    // No withTenant call at all -- this must still find a job, unlike
    // every other query against every other tenant-scoped table above.
    const firstClaim = await f.pool.query("select * from claim_next_job(array['import.commit','invitations.send'])");
    assert.notEqual(firstClaim.rows[0].id, null);
    assert.equal(firstClaim.rows[0].status, "running");

    const secondClaim = await f.pool.query("select * from claim_next_job(array['import.commit','invitations.send'])");
    assert.notEqual(secondClaim.rows[0].id, null);
    assert.notEqual(secondClaim.rows[0].tenant_id, firstClaim.rows[0].tenant_id);

    const thirdClaim = await f.pool.query("select * from claim_next_job(array['import.commit','invitations.send'])");
    assert.equal(thirdClaim.rows[0].id, null);
  } finally {
    await tearDown(f);
  }
});
