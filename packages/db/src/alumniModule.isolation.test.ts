import assert from "node:assert/strict";
import { test } from "node:test";
import { Client, Pool } from "pg";
import {
  APP_URL,
  createFixtureCollegeUser,
  createFixtureOpportunity,
  createFixtureTenant,
  SUPERUSER_URL,
} from "./testFixtures.js";
import { withTenant } from "./withTenant.js";

/**
 * The existing isolation tests (e.g. studentImport.isolation.test.ts)
 * prove a forgotten WHERE clause can't leak a READ across tenants. They
 * would NOT catch the risk Phase 2 introduces: a client-supplied id,
 * inside an otherwise correctly tenant-scoped WRITE, naming a row that
 * lives in a different tenant. That's what the composite (tenant_id, id)
 * foreign keys in the alumni_module migration close, and what this file
 * asserts -- a request naming an alumnus, or an opportunity, that belongs
 * to a different tenant than the request itself fails at INSERT time,
 * unconditionally, regardless of what the API layer does or doesn't check.
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

  const { id: tenantAId } = await createFixtureTenant(superuser, "Alumni Module Isolation Tenant A");
  const { id: tenantBId } = await createFixtureTenant(superuser, "Alumni Module Isolation Tenant B");

  return { superuser, pool, tenantAId, tenantBId };
}

async function tearDown(f: Fixtures): Promise<void> {
  await f.pool.end();
  await f.superuser.end();
}

test("rejects a request naming an alumnus from another tenant", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnusInA } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });
    const { collegeUserId: studentInB } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantBId, role: "student" });

    // studentInB attempts to send a mentorship request to alumnusInA -- a
    // real client-facing scenario if the API ever failed to check that the
    // target alumnus belongs to the caller's own tenant.
    await assert.rejects(
      () =>
        withTenant(f.pool, f.tenantBId, (client) =>
          client.query(
            `insert into public.requests
               (tenant_id, student_college_user_id, alumnus_college_user_id, type, message)
             values ($1, $2, $3, 'mentorship', 'test message')`,
            [f.tenantBId, studentInB, alumnusInA],
          ),
        ),
      /violates foreign key constraint "requests_alumnus_tenant_fkey"/,
    );
  } finally {
    await tearDown(f);
  }
});

test("rejects a referral request naming an opportunity from another tenant", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnusInB } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantBId, role: "alumni" });
    const { collegeUserId: studentInB } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantBId, role: "student" });
    const { collegeUserId: alumnusInA } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });
    const opportunityInA = await createFixtureOpportunity(f.superuser, {
      tenantId: f.tenantAId,
      postedByCollegeUserId: alumnusInA,
      type: "referral",
    });

    // Every party except the opportunity is correctly in tenant B here --
    // this isolates the opportunity_id reference specifically.
    await assert.rejects(
      () =>
        withTenant(f.pool, f.tenantBId, (client) =>
          client.query(
            `insert into public.requests
               (tenant_id, student_college_user_id, alumnus_college_user_id, type, opportunity_id, message)
             values ($1, $2, $3, 'referral', $4, 'test message')`,
            [f.tenantBId, studentInB, alumnusInB, opportunityInA.id],
          ),
        ),
      /violates foreign key constraint "requests_opportunity_tenant_fkey"/,
    );
  } finally {
    await tearDown(f);
  }
});

test("rejects an opportunity posted with a poster from another tenant", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnusInA } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });

    await assert.rejects(
      () =>
        withTenant(f.pool, f.tenantBId, (client) =>
          client.query(
            `insert into public.opportunities (tenant_id, posted_by_college_user_id, type, title)
             values ($1, $2, 'job', 'test posting')`,
            [f.tenantBId, alumnusInA],
          ),
        ),
      /violates foreign key constraint "opportunities_posted_by_tenant_fkey"/,
    );
  } finally {
    await tearDown(f);
  }
});

test("rejects an alumni_profiles row for a college_user from another tenant", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnusInA } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });

    await assert.rejects(
      () =>
        withTenant(f.pool, f.tenantBId, (client) =>
          client.query(`insert into public.alumni_profiles (tenant_id, college_user_id, bio) values ($1, $2, 'test bio')`, [
            f.tenantBId,
            alumnusInA,
          ]),
        ),
      /violates foreign key constraint "alumni_profiles_college_user_tenant_fkey"/,
    );
  } finally {
    await tearDown(f);
  }
});

// Positive control: the same inserts, entirely within one tenant, must
// still succeed. Without this, the negative tests above could pass for
// the wrong reason (e.g. a typo breaking the insert for everyone).
test("accepts a same-tenant mentorship request end to end", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnus } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });
    const { collegeUserId: student } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "student" });

    const result = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query(
        `insert into public.requests
           (tenant_id, student_college_user_id, alumnus_college_user_id, type, message)
         values ($1, $2, $3, 'mentorship', 'test message')
         returning id`,
        [f.tenantAId, student, alumnus],
      ),
    );
    assert.equal(result.rows.length, 1);
  } finally {
    await tearDown(f);
  }
});

test("accepts a same-tenant referral request tied to a same-tenant opportunity", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnus } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });
    const { collegeUserId: student } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "student" });
    const opportunity = await createFixtureOpportunity(f.superuser, {
      tenantId: f.tenantAId,
      postedByCollegeUserId: alumnus,
      type: "referral",
    });

    const result = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query(
        `insert into public.requests
           (tenant_id, student_college_user_id, alumnus_college_user_id, type, opportunity_id, message)
         values ($1, $2, $3, 'referral', $4, 'test message')
         returning id`,
        [f.tenantAId, student, alumnus, opportunity.id],
      ),
    );
    assert.equal(result.rows.length, 1);
  } finally {
    await tearDown(f);
  }
});

// requests_referral_needs_opportunity: enforced at the database
// regardless of the zod superRefine in packages/shared.
test("the database itself rejects a referral request with no opportunity_id", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnus } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });
    const { collegeUserId: student } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "student" });

    await assert.rejects(
      () =>
        withTenant(f.pool, f.tenantAId, (client) =>
          client.query(
            `insert into public.requests (tenant_id, student_college_user_id, alumnus_college_user_id, type, message)
             values ($1, $2, $3, 'referral', 'test message')`,
            [f.tenantAId, student, alumnus],
          ),
        ),
      /violates check constraint "requests_referral_needs_opportunity"/,
    );
  } finally {
    await tearDown(f);
  }
});

test("the database itself rejects a mentorship request that names an opportunity", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnus } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });
    const { collegeUserId: student } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "student" });
    const opportunity = await createFixtureOpportunity(f.superuser, {
      tenantId: f.tenantAId,
      postedByCollegeUserId: alumnus,
      type: "referral",
    });

    await assert.rejects(
      () =>
        withTenant(f.pool, f.tenantAId, (client) =>
          client.query(
            `insert into public.requests
               (tenant_id, student_college_user_id, alumnus_college_user_id, type, opportunity_id, message)
             values ($1, $2, $3, 'mentorship', $4, 'test message')`,
            [f.tenantAId, student, alumnus, opportunity.id],
          ),
        ),
      /violates check constraint "requests_referral_needs_opportunity"/,
    );
  } finally {
    await tearDown(f);
  }
});

// Ordinary tenant-scoped read isolation, same shape as every other table
// in this codebase's isolation suite -- included here for completeness
// alongside the write-isolation tests above, which are this file's main point.
test("an opportunities row scoped to tenant A never returns tenant B's row", async () => {
  const f = await setUp();
  try {
    const { collegeUserId: alumnusInA } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantAId, role: "alumni" });
    const { collegeUserId: alumnusInB } = await createFixtureCollegeUser(f.superuser, { tenantId: f.tenantBId, role: "alumni" });
    await createFixtureOpportunity(f.superuser, { tenantId: f.tenantAId, postedByCollegeUserId: alumnusInA });
    await createFixtureOpportunity(f.superuser, { tenantId: f.tenantBId, postedByCollegeUserId: alumnusInB });

    const seenAsTenantA = await withTenant(f.pool, f.tenantAId, (client) =>
      client.query("select tenant_id from public.opportunities"),
    );
    assert.equal(seenAsTenantA.rows.length, 1);
    assert.equal(seenAsTenantA.rows[0].tenant_id, f.tenantAId);

    const seenWithNoTenant = await f.pool.query("select tenant_id from public.opportunities");
    assert.equal(seenWithNoTenant.rows.length, 0);
  } finally {
    await tearDown(f);
  }
});
