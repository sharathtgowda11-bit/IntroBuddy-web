import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_URL, createFixtureTenant, SUPERUSER_URL, uniqueSuffix } from "@introbuddy/db";
import { Client, Pool } from "pg";
import request from "supertest";
import sharp from "sharp";
import { createApp } from "../app.js";
import { createFixtureActor } from "../testHelpers/actors.js";

/**
 * Milestone 5's own-profile self-service surface: college-managed fields
 * stay read-only, self-authored fields (avatar, resume, LinkedIn/GitHub,
 * bio/skills/interests/achievements, certifications) are the student's
 * own to edit, and profileComplete is computed (never stored) from
 * avatar + LinkedIn both being present (spec 8.4).
 */

const app = createApp();

interface Ctx {
  superuser: Client;
  pool: Pool;
  tenantId: string;
  studentAuthHeader: string;
  otherStudentAuthHeader: string;
}

async function setUp(): Promise<Ctx> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });

  const { id: tenantId } = await createFixtureTenant(superuser, `Me E2E Tenant ${uniqueSuffix()}`);
  const student = await createFixtureActor(superuser, pool, tenantId, { role: "student" });
  const otherStudent = await createFixtureActor(superuser, pool, tenantId, { role: "student" });

  return {
    superuser,
    pool,
    tenantId,
    studentAuthHeader: student.authHeader,
    otherStudentAuthHeader: otherStudent.authHeader,
  };
}

async function tearDown(ctx: Ctx): Promise<void> {
  await ctx.pool.end();
  await ctx.superuser.end();
}

async function makeTinyJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 10, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
}

test("GET /me/profile starts incomplete with no self-authored data", async () => {
  const ctx = await setUp();
  try {
    const response = await request(app).get("/me/profile").set("Authorization", ctx.studentAuthHeader);
    assert.equal(response.status, 200);
    assert.equal(response.body.profileComplete, false);
    assert.equal(response.body.avatarUrl, null);
    assert.equal(response.body.linkedinUrl, null);
    assert.deepEqual(response.body.certifications, []);
  } finally {
    await tearDown(ctx);
  }
});

test("PATCH /me/profile with an avatar and LinkedIn URL completes the profile", async () => {
  const ctx = await setUp();
  try {
    const jpeg = await makeTinyJpeg();

    const patchResponse = await request(app)
      .patch("/me/profile")
      .set("Authorization", ctx.studentAuthHeader)
      .field("linkedinUrl", "https://www.linkedin.com/in/example")
      .field("bio", "Aspiring engineer")
      .attach("avatar", jpeg, "avatar.jpg");
    assert.equal(patchResponse.status, 200);

    const getResponse = await request(app).get("/me/profile").set("Authorization", ctx.studentAuthHeader);
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.profileComplete, true);
    assert.ok(getResponse.body.avatarUrl);
    assert.equal(getResponse.body.linkedinUrl, "https://www.linkedin.com/in/example");
    assert.equal(getResponse.body.bio, "Aspiring engineer");
  } finally {
    await tearDown(ctx);
  }
});

test("PATCH /me/profile rejects a non-PDF resume upload", async () => {
  const ctx = await setUp();
  try {
    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", ctx.studentAuthHeader)
      .attach("resume", Buffer.from("not a pdf"), { filename: "resume.txt", contentType: "text/plain" });
    assert.equal(response.status, 400);
  } finally {
    await tearDown(ctx);
  }
});

test("PATCH /me/profile accepts a PDF resume", async () => {
  const ctx = await setUp();
  try {
    const response = await request(app)
      .patch("/me/profile")
      .set("Authorization", ctx.studentAuthHeader)
      .attach("resume", Buffer.from("%PDF-1.4 fake pdf content for testing"), {
        filename: "resume.pdf",
        contentType: "application/pdf",
      });
    assert.equal(response.status, 200);

    const getResponse = await request(app).get("/me/profile").set("Authorization", ctx.studentAuthHeader);
    assert.ok(getResponse.body.resumeUrl);
  } finally {
    await tearDown(ctx);
  }
});

test("certifications: create, list via profile, update, delete", async () => {
  const ctx = await setUp();
  try {
    const createResponse = await request(app)
      .post("/me/certifications")
      .set("Authorization", ctx.studentAuthHeader)
      .send({ name: "Intro to SQL", type: "course", issuingOrganisation: "Coursera" });
    assert.equal(createResponse.status, 201);
    const certificationId: string = createResponse.body.id;

    const afterCreate = await request(app).get("/me/profile").set("Authorization", ctx.studentAuthHeader);
    assert.equal(afterCreate.body.certifications.length, 1);
    assert.equal(afterCreate.body.certifications[0].name, "Intro to SQL");

    const updateResponse = await request(app)
      .patch(`/me/certifications/${certificationId}`)
      .set("Authorization", ctx.studentAuthHeader)
      .send({ name: "Intro to SQL (Advanced)" });
    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.name, "Intro to SQL (Advanced)");

    const deleteResponse = await request(app)
      .delete(`/me/certifications/${certificationId}`)
      .set("Authorization", ctx.studentAuthHeader);
    assert.equal(deleteResponse.status, 200);

    const afterDelete = await request(app).get("/me/profile").set("Authorization", ctx.studentAuthHeader);
    assert.deepEqual(afterDelete.body.certifications, []);
  } finally {
    await tearDown(ctx);
  }
});

test("a student cannot edit or delete another student's certification", async () => {
  const ctx = await setUp();
  try {
    const createResponse = await request(app)
      .post("/me/certifications")
      .set("Authorization", ctx.studentAuthHeader)
      .send({ name: "Intro to SQL", type: "course", issuingOrganisation: "Coursera" });
    const certificationId: string = createResponse.body.id;

    const updateAsOther = await request(app)
      .patch(`/me/certifications/${certificationId}`)
      .set("Authorization", ctx.otherStudentAuthHeader)
      .send({ name: "Hijacked" });
    assert.equal(updateAsOther.status, 404);

    const deleteAsOther = await request(app)
      .delete(`/me/certifications/${certificationId}`)
      .set("Authorization", ctx.otherStudentAuthHeader);
    assert.equal(deleteAsOther.status, 404);

    const stillThere = await request(app).get("/me/profile").set("Authorization", ctx.studentAuthHeader);
    assert.equal(stillThere.body.certifications[0].name, "Intro to SQL");
  } finally {
    await tearDown(ctx);
  }
});

test("GET /me/profile requires a valid session", async () => {
  const ctx = await setUp();
  try {
    const response = await request(app).get("/me/profile");
    assert.equal(response.status, 401);
  } finally {
    await tearDown(ctx);
  }
});
