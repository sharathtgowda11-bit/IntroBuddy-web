import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, Pool } from "pg";
import { APP_URL, createFixtureCollegeUser, createFixtureTenant, SUPERUSER_URL } from "./testFixtures.js";
import { withTenant } from "./withTenant.js";

/**
 * Extends the section 6.6 isolation test to the three tables Milestone 3
 * adds: degrees, departments, audit_log. Same FORCE ROW LEVEL SECURITY +
 * tenant_isolation policy as every other tenant-scoped table -- no
 * exception for administrative/configuration data either. Must never be
 * skipped or deleted.
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

  const { id: tenantAId } = await createFixtureTenant(superuser, "Onboarding Isolation Tenant A");
  const { id: tenantBId } = await createFixtureTenant(superuser, "Onboarding Isolation Tenant B");
  const { collegeUserId: collegeUserAId } = await createFixtureCollegeUser(superuser, { tenantId: tenantAId });
  const { collegeUserId: collegeUserBId } = await createFixtureCollegeUser(superuser, { tenantId: tenantBId });

  return { superuser, pool, tenantAId, tenantBId, collegeUserAId, collegeUserBId };
}

async function tearDown(fixtures: Fixtures): Promise<void> {
  await fixtures.pool.end();
  await fixtures.superuser.end();
}

test("a degree row scoped to tenant A never returns tenant B's rows", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(`insert into public.degrees (tenant_id, name) values ($1, 'B.Tech')`, [f.tenantAId]);
    await f.superuser.query(`insert into public.degrees (tenant_id, name) values ($1, 'B.Tech')`, [f.tenantBId]);

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.degrees"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.degrees");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("a department row scoped to tenant A never returns tenant B's rows", async () => {
  const f = await setUp();
  try {
    const degreeA = await f.superuser.query<{ id: string }>(
      `insert into public.degrees (tenant_id, name) values ($1, 'B.Tech') returning id`,
      [f.tenantAId],
    );
    const degreeB = await f.superuser.query<{ id: string }>(
      `insert into public.degrees (tenant_id, name) values ($1, 'B.Tech') returning id`,
      [f.tenantBId],
    );

    await f.superuser.query(`insert into public.departments (tenant_id, degree_id, name) values ($1, $2, 'Computer Science')`, [
      f.tenantAId,
      degreeA.rows[0].id,
    ]);
    await f.superuser.query(`insert into public.departments (tenant_id, degree_id, name) values ($1, $2, 'Computer Science')`, [
      f.tenantBId,
      degreeB.rows[0].id,
    ]);

    const seenAsTenantB = await withTenant(f.pool, f.tenantBId, (client) =>
      client.query("select tenant_id from public.departments"),
    );
    assert.equal(seenAsTenantB.rows.length, 1);
    assert.equal(seenAsTenantB.rows[0].tenant_id, f.tenantBId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.departments");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("an audit_log row scoped to tenant A never returns tenant B's rows", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(
      `insert into public.audit_log (tenant_id, actor_college_user_id, action, target_type, target_id)
       values ($1, $2, 'college.create', 'tenant', $1)`,
      [f.tenantAId, f.collegeUserAId],
    );
    await f.superuser.query(
      `insert into public.audit_log (tenant_id, actor_college_user_id, action, target_type, target_id)
       values ($1, $2, 'college.create', 'tenant', $1)`,
      [f.tenantBId, f.collegeUserBId],
    );

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.audit_log"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.audit_log");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});
