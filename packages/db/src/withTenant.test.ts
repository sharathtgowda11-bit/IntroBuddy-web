import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, Pool } from "pg";
import { createFixtureCollegeUser, createFixtureTenant, APP_URL, SUPERUSER_URL } from "./testFixtures.js";
import { withTenant } from "./withTenant.js";

/**
 * This is the test spec section 6.6 calls out by name: create two tenants,
 * populate each with data, and assert that scoping to one never returns the
 * other's rows. It must never be skipped or deleted.
 *
 * It exercises the database's row-level security policy directly -- the
 * last line of defence from section 6.2 -- rather than going through
 * session resolution or the API, which don't exist yet (Milestone 2). Given
 * a tenant id, this proves Postgres itself will never hand back another
 * tenant's rows, regardless of what the application layer does or forgets.
 */

test("a query scoped to tenant A never returns tenant B's rows", async () => {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  try {
    const { id: tenantAId } = await createFixtureTenant(superuser, "Test Tenant A");
    const { id: tenantBId } = await createFixtureTenant(superuser, "Test Tenant B");

    await createFixtureCollegeUser(superuser, { tenantId: tenantAId });
    await createFixtureCollegeUser(superuser, { tenantId: tenantBId });

    const seenAsTenantA = await withTenant(pool, tenantAId, (client) =>
      client.query("select tenant_id from public.college_users"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, tenantAId);

    const seenAsTenantB = await withTenant(pool, tenantBId, (client) =>
      client.query("select tenant_id from public.college_users"),
    );
    assert.equal(seenAsTenantB.rows.length, 1);
    assert.equal(seenAsTenantB.rows[0].tenant_id, tenantBId);

    // No tenant context set at all -- including on a pooled connection
    // reused from the calls above, where a plain SET (instead of SET
    // LOCAL) would have leaked tenant B's setting here. Must fail closed:
    // zero rows, not an error, not every row.
    const seenWithNoTenant = await pool.query("select tenant_id from public.college_users");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await pool.end();
    await superuser.end();
  }
});
