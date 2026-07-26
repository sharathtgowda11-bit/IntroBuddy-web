import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, Pool } from "pg";
import { APP_URL, createFixtureDepartment, createFixtureIdentity, createFixtureTenant, SUPERUSER_URL } from "./testFixtures.js";
import { withTenant } from "./withTenant.js";

/**
 * Proves the tenant_integrity_hardening migration's composite FKs
 * (college_users -> degrees/departments, departments -> degrees) reject a
 * cross-tenant reference at the database, the same way the alumni module's
 * own composite FKs do. This closes a gap that predates Phase 2: nothing
 * previously stopped a row from pointing at another tenant's taxonomy if
 * the resolving application code ever had a bug.
 */

interface Fixtures {
  superuser: Client;
  pool: Pool;
  tenantAId: string;
  tenantBId: string;
}

async function setUp(): Promise<Fixtures> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  const { id: tenantAId } = await createFixtureTenant(superuser, "Tenant Integrity Hardening Tenant A");
  const { id: tenantBId } = await createFixtureTenant(superuser, "Tenant Integrity Hardening Tenant B");

  return { superuser, pool, tenantAId, tenantBId };
}

async function tearDown(f: Fixtures): Promise<void> {
  await f.pool.end();
  await f.superuser.end();
}

test("rejects a college_users row whose department_id belongs to another tenant", async () => {
  const f = await setUp();
  try {
    const departmentInA = await createFixtureDepartment(f.superuser, f.tenantAId);
    const userId = await createFixtureIdentity(f.superuser, `cross-tenant-dept-${Date.now()}@example.com`);

    // degree_id left null so this insert isolates the department FK --
    // MATCH SIMPLE (the default) means a null degree_id trivially
    // satisfies its own composite FK, so only department_id_tenant_fkey
    // is exercised here (a non-null cross-tenant degree_id would trip
    // *that* FK first, before Postgres even evaluates this one).
    await assert.rejects(
      () =>
        withTenant(f.pool, f.tenantBId, (client) =>
          client.query(
            `insert into public.college_users (tenant_id, user_id, email, role, status, department_id, graduation_year)
             values ($1, $2, 'cross-tenant-dept@example.com', 'student', 'active', $3, 2027)`,
            [f.tenantBId, userId, departmentInA.departmentId],
          ),
        ),
      /violates foreign key constraint "college_users_department_id_tenant_fkey"/,
    );
  } finally {
    await tearDown(f);
  }
});

test("rejects a department whose degree_id belongs to another tenant", async () => {
  const f = await setUp();
  try {
    const { degreeId: degreeInA } = await createFixtureDepartment(f.superuser, f.tenantAId);

    await assert.rejects(
      () =>
        withTenant(f.pool, f.tenantBId, (client) =>
          client.query(`insert into public.departments (tenant_id, degree_id, name) values ($1, $2, 'Cross-tenant department')`, [
            f.tenantBId,
            degreeInA,
          ]),
        ),
      /violates foreign key constraint "departments_degree_id_tenant_fkey"/,
    );
  } finally {
    await tearDown(f);
  }
});

test("positive control: a same-tenant department reference still succeeds", async () => {
  const f = await setUp();
  try {
    const department = await createFixtureDepartment(f.superuser, f.tenantAId);
    const userId = await createFixtureIdentity(f.superuser, `same-tenant-dept-${Date.now()}@example.com`);

    const result = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query(
        `insert into public.college_users (tenant_id, user_id, email, role, status, department_id, degree_id, graduation_year)
         values ($1, $2, 'same-tenant-dept@example.com', 'student', 'active', $3, $4, 2027)
         returning id`,
        [f.tenantAId, userId, department.departmentId, department.degreeId],
      ),
    );
    assert.equal(result.rows.length, 1);
  } finally {
    await tearDown(f);
  }
});
