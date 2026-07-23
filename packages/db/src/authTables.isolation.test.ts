import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, Pool } from "pg";
import {
  APP_URL,
  createFixtureCollegeUser,
  createFixtureTenant,
  fixtureExpiry,
  fixtureTokenHash,
  SUPERUSER_URL,
} from "./testFixtures.js";
import { withTenant } from "./withTenant.js";

/**
 * Extends the section 6.6 isolation test to the three tables this
 * milestone adds: invitations, password_resets, sessions. Each carries the
 * exact same FORCE ROW LEVEL SECURITY + tenant_isolation policy as
 * college_users -- no table gets a silent exception, including the
 * session table that requests authenticate through. Must never be
 * skipped or deleted, same as withTenant.test.ts.
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

  const { id: tenantAId } = await createFixtureTenant(superuser, "Isolation Tenant A");
  const { id: tenantBId } = await createFixtureTenant(superuser, "Isolation Tenant B");
  const { collegeUserId: collegeUserAId } = await createFixtureCollegeUser(superuser, { tenantId: tenantAId });
  const { collegeUserId: collegeUserBId } = await createFixtureCollegeUser(superuser, { tenantId: tenantBId });

  return { superuser, pool, tenantAId, tenantBId, collegeUserAId, collegeUserBId };
}

async function tearDown(fixtures: Fixtures): Promise<void> {
  await fixtures.pool.end();
  await fixtures.superuser.end();
}

test("an invitation row scoped to tenant A never returns tenant B's rows", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(
      `insert into public.invitations (tenant_id, college_user_id, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $2, $4)`,
      [f.tenantAId, f.collegeUserAId, fixtureTokenHash(), fixtureExpiry()],
    );
    await f.superuser.query(
      `insert into public.invitations (tenant_id, college_user_id, token_hash, invited_by, expires_at)
       values ($1, $2, $3, $2, $4)`,
      [f.tenantBId, f.collegeUserBId, fixtureTokenHash(), fixtureExpiry()],
    );

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.invitations"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.invitations");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("a password_resets row scoped to tenant A never returns tenant B's rows", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(
      `insert into public.password_resets (tenant_id, college_user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [f.tenantAId, f.collegeUserAId, fixtureTokenHash(), fixtureExpiry()],
    );
    await f.superuser.query(
      `insert into public.password_resets (tenant_id, college_user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [f.tenantBId, f.collegeUserBId, fixtureTokenHash(), fixtureExpiry()],
    );

    const seenAsTenantB = await withTenant(f.pool, f.tenantBId, (client) =>
      client.query("select tenant_id from public.password_resets"),
    );
    assert.equal(seenAsTenantB.rows.length, 1);
    assert.equal(seenAsTenantB.rows[0].tenant_id, f.tenantBId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.password_resets");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});

test("a session row scoped to tenant A never returns tenant B's rows, even if the wrong tenant prefix is supplied", async () => {
  const f = await setUp();
  try {
    await f.superuser.query(
      `insert into public.sessions (tenant_id, college_user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [f.tenantAId, f.collegeUserAId, fixtureTokenHash(), fixtureExpiry()],
    );
    await f.superuser.query(
      `insert into public.sessions (tenant_id, college_user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [f.tenantBId, f.collegeUserBId, fixtureTokenHash(), fixtureExpiry()],
    );

    // This is the scenario resolveSession's tenant-prefix cross-check
    // exists for: a session actually belonging to tenant B, looked up
    // while scoped to tenant A (e.g. a tampered compound token), must
    // come back empty rather than exposing tenant B's session.
    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.sessions"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);
  } finally {
    await tearDown(f);
  }
});
