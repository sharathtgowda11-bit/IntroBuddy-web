import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, Pool } from "pg";
import { APP_URL, createFixtureCollegeUser, createFixtureTenant, SUPERUSER_URL } from "./testFixtures.js";
import { withTenant } from "./withTenant.js";

/**
 * Extends the section 6.6 isolation test to the three tables Milestone 5
 * adds: consents, student_profiles, certifications. Same FORCE ROW LEVEL
 * SECURITY + tenant_isolation policy as every other tenant-scoped table.
 * Must never be skipped or deleted.
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

  const { id: tenantAId } = await createFixtureTenant(superuser, "Student Experience Isolation Tenant A");
  const { id: tenantBId } = await createFixtureTenant(superuser, "Student Experience Isolation Tenant B");
  const { collegeUserId: collegeUserAId } = await createFixtureCollegeUser(superuser, { tenantId: tenantAId });
  const { collegeUserId: collegeUserBId } = await createFixtureCollegeUser(superuser, { tenantId: tenantBId });

  return { superuser, pool, tenantAId, tenantBId, collegeUserAId, collegeUserBId };
}

async function tearDown(fixtures: Fixtures): Promise<void> {
  await fixtures.pool.end();
  await fixtures.superuser.end();
}

test("a consents row scoped to tenant A never returns tenant B's row", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(
      `insert into public.consents (tenant_id, college_user_id, policy_version) values ($1, $2, '1.0')`,
      [f.tenantAId, f.collegeUserAId],
    );
    await f.superuser.query(
      `insert into public.consents (tenant_id, college_user_id, policy_version) values ($1, $2, '1.0')`,
      [f.tenantBId, f.collegeUserBId],
    );

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.consents"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.consents");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("a student_profiles row scoped to tenant A never returns tenant B's row", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(`insert into public.student_profiles (tenant_id, college_user_id) values ($1, $2)`, [
      f.tenantAId,
      f.collegeUserAId,
    ]);
    await f.superuser.query(`insert into public.student_profiles (tenant_id, college_user_id) values ($1, $2)`, [
      f.tenantBId,
      f.collegeUserBId,
    ]);

    const seenAsTenantB = await withTenant(f.pool, f.tenantBId, (client) =>
      client.query("select tenant_id from public.student_profiles"),
    );
    assert.equal(seenAsTenantB.rows.length, 1);
    assert.equal(seenAsTenantB.rows[0].tenant_id, f.tenantBId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.student_profiles");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("a certifications row scoped to tenant A never returns tenant B's row", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(
      `insert into public.certifications (tenant_id, college_user_id, name, type, issuing_organisation)
       values ($1, $2, 'Intro to SQL', 'course', 'Coursera')`,
      [f.tenantAId, f.collegeUserAId],
    );
    await f.superuser.query(
      `insert into public.certifications (tenant_id, college_user_id, name, type, issuing_organisation)
       values ($1, $2, 'Intro to SQL', 'course', 'Coursera')`,
      [f.tenantBId, f.collegeUserBId],
    );

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.certifications"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.certifications");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});
