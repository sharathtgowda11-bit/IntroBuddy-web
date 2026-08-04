import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_URL, createFixtureTenant, SUPERUSER_URL, uniqueSuffix } from "@introbuddy/db";
import { slugify } from "@introbuddy/shared";
import { Client, Pool } from "pg";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { createFixtureActor } from "../testHelpers/actors.js";
import { clearMailpit, extractTokenFromEmail, waitForEmailTo } from "../testHelpers/mailpit.js";

/**
 * Milestone 3's demonstrable outcome, spec section 16: "A college can be
 * created and configured end to end." Also covers the security finding
 * from this milestone's plan (reinvite-admin must not be reachable
 * cross-tenant by a college_admin) and the one FK-backed guard that is
 * actually in scope today (degree deletion blocked by an attached
 * department -- the *student*-attachment guard is deliberately deferred,
 * see the migration's comment).
 */

const app = createApp();
const PASSWORD = "Zq7-Wombat-Fjord-99";

interface Ctx {
  superuser: Client;
  pool: Pool;
  tenantId: string;
  superAdminAuthHeader: string;
}

async function setUp(): Promise<Ctx> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });
  await superuser.query("delete from public.rate_limit_hits");

  const { id: tenantId } = await createFixtureTenant(superuser, `Colleges E2E Tenant ${uniqueSuffix()}`);
  const superAdmin = await createFixtureActor(superuser, pool, tenantId, { role: "super_admin" });

  return { superuser, pool, tenantId, superAdminAuthHeader: superAdmin.authHeader };
}

async function tearDown(ctx: Ctx): Promise<void> {
  await ctx.pool.end();
  await ctx.superuser.end();
}

async function makeTinyJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 10, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
}

test("full college creation -> admin activation -> login, with an audit log entry", async () => {
  const ctx = await setUp();
  try {
    await clearMailpit();
    const adminEmail = `admin-${uniqueSuffix()}@example.com`;
    const shortName = `TestCollege${uniqueSuffix()}`;

    const createResponse = await request(app)
      .post("/colleges")
      .set("Authorization", ctx.superAdminAuthHeader)
      .send({
        name: `Test College ${uniqueSuffix()}`,
        shortName,
        state: "Karnataka",
        city: "Bengaluru",
        adminName: "Test Admin",
        adminEmail,
      });
    assert.equal(createResponse.status, 201);
    const { id: newTenantId, slug, status } = createResponse.body;
    assert.equal(status, "provisioning");
    // The college's own chosen short name becomes the slug/college ID --
    // not something auto-derived from the full name.
    assert.equal(slug, slugify(shortName));

    // Audit log written atomically with creation (ADR 0008) -- read via
    // the superuser connection since app_user's own read would need
    // withTenant, which is exactly the isolation already proven in
    // packages/db/src/collegeOnboarding.isolation.test.ts.
    const auditRows = await ctx.superuser.query(
      "select action, target_type, target_id from public.audit_log where tenant_id = $1",
      [newTenantId],
    );
    assert.equal(auditRows.rows.length, 1);
    assert.equal(auditRows.rows[0].action, "college.create");
    assert.equal(auditRows.rows[0].target_id, newTenantId);

    const token = extractTokenFromEmail(await waitForEmailTo(adminEmail));
    const activateResponse = await request(app).post("/auth/activate").send({ token, password: PASSWORD });
    assert.equal(activateResponse.status, 200);

    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: slug, emailOrUsn: adminEmail, password: PASSWORD });
    assert.equal(loginResponse.status, 200);
  } finally {
    await tearDown(ctx);
  }
});

test("a non-super_admin cannot create a college", async () => {
  const ctx = await setUp();
  try {
    const collegeAdmin = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "college_admin" });

    const response = await request(app)
      .post("/colleges")
      .set("Authorization", collegeAdmin.authHeader)
      .send({
        name: "Should Not Work",
        shortName: `ShouldNotWork${uniqueSuffix()}`,
        state: "X",
        city: "Y",
        adminName: "Z",
        adminEmail: `nope-${uniqueSuffix()}@example.com`,
      });

    assert.equal(response.status, 403);
  } finally {
    await tearDown(ctx);
  }
});

test("creating a college with a short name that's already in use is rejected with 409, and creates nothing", async () => {
  const ctx = await setUp();
  try {
    const shortName = `Dup${uniqueSuffix()}`;
    const firstResponse = await request(app)
      .post("/colleges")
      .set("Authorization", ctx.superAdminAuthHeader)
      .send({
        name: "First College",
        shortName,
        state: "Karnataka",
        city: "Bengaluru",
        adminName: "Admin One",
        adminEmail: `admin-one-${uniqueSuffix()}@example.com`,
      });
    assert.equal(firstResponse.status, 201);

    // Same short name, different casing -- slugify() normalizes both to the
    // same slug, so this must collide too, not slip through as "distinct".
    const secondResponse = await request(app)
      .post("/colleges")
      .set("Authorization", ctx.superAdminAuthHeader)
      .send({
        name: "Second College",
        shortName: shortName.toUpperCase(),
        state: "Karnataka",
        city: "Mysuru",
        adminName: "Admin Two",
        adminEmail: `admin-two-${uniqueSuffix()}@example.com`,
      });
    assert.equal(secondResponse.status, 409);

    const tenantRows = await ctx.superuser.query("select count(*) from public.tenants where slug = $1", [slugify(shortName)]);
    assert.equal(tenantRows.rows[0].count, "1");
  } finally {
    await tearDown(ctx);
  }
});

test("profile update flips status from provisioning to active once logo and banner are both set", async () => {
  const ctx = await setUp();
  try {
    await clearMailpit();
    const adminEmail = `admin-${uniqueSuffix()}@example.com`;

    const createResponse = await request(app)
      .post("/colleges")
      .set("Authorization", ctx.superAdminAuthHeader)
      .send({
        name: `Test College ${uniqueSuffix()}`,
        shortName: `TestCollege${uniqueSuffix()}`,
        state: "Karnataka",
        city: "Bengaluru",
        adminName: "Test Admin",
        adminEmail,
      });
    const { slug } = createResponse.body;

    const token = extractTokenFromEmail(await waitForEmailTo(adminEmail));
    await request(app).post("/auth/activate").send({ token, password: PASSWORD });
    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ tenantSlug: slug, emailOrUsn: adminEmail, password: PASSWORD });
    const adminToken: string = loginResponse.body.token;

    const tinyJpeg = await makeTinyJpeg();

    const updateResponse = await request(app)
      .patch("/colleges/me/profile")
      .set("Authorization", `Bearer ${adminToken}`)
      .field("description", "A fine college")
      .attach("logo", tinyJpeg, { filename: "logo.jpg", contentType: "image/jpeg" })
      .attach("banner", tinyJpeg, { filename: "banner.jpg", contentType: "image/jpeg" });
    assert.equal(updateResponse.status, 200);

    const meResponse = await request(app).get("/colleges/me").set("Authorization", `Bearer ${adminToken}`);
    assert.equal(meResponse.body.status, "active");
    assert.ok(meResponse.body.logoUrl);
    assert.ok(meResponse.body.bannerUrl);
  } finally {
    await tearDown(ctx);
  }
});

test("deleting a degree with a department still attached is rejected with 409", async () => {
  const ctx = await setUp();
  try {
    const collegeAdmin = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "college_admin" });

    const degreeResponse = await request(app).post("/degrees").set("Authorization", collegeAdmin.authHeader).send({ name: "B.Sc" });
    const degreeId = degreeResponse.body.id;

    await request(app)
      .post("/departments")
      .set("Authorization", collegeAdmin.authHeader)
      .send({ degreeId, name: "Physics" });

    const deleteResponse = await request(app).delete(`/degrees/${degreeId}`).set("Authorization", collegeAdmin.authHeader);
    assert.equal(deleteResponse.status, 409);
  } finally {
    await tearDown(ctx);
  }
});

test("reinvite-admin is rejected for a college_admin targeting a different college", async () => {
  const ctx = await setUp();
  try {
    const { id: otherTenantId } = await createFixtureTenant(ctx.superuser, `Other Tenant ${uniqueSuffix()}`);
    const collegeAdmin = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "college_admin" });

    const response = await request(app)
      .post(`/colleges/${otherTenantId}/reinvite-admin`)
      .set("Authorization", collegeAdmin.authHeader)
      .send({});

    assert.equal(response.status, 403);
  } finally {
    await tearDown(ctx);
  }
});
