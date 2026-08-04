import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_URL, createFixtureCollegeUser, createFixtureTenant, SUPERUSER_URL, uniqueSuffix } from "@introbuddy/db";
import { Client, Pool } from "pg";
import request from "supertest";
import { createApp } from "../app.js";
import { createFixtureActor } from "../testHelpers/actors.js";

/**
 * Phase 2's additional e2e coverage (plan Part 12.1): permission
 * boundaries, the referral/mentorship application-layer checks, directory
 * visibility for incomplete profiles, and the 409-not-silent-overwrite/
 * 409-not-raw-db-error precedents for requests and opportunities.
 */

const app = createApp();

interface Ctx {
  superuser: Client;
  pool: Pool;
  tenantId: string;
}

async function setUp(): Promise<Ctx> {
  const superuser = new Client({ connectionString: SUPERUSER_URL });
  await superuser.connect();
  const pool = new Pool({ connectionString: APP_URL });
  const { id: tenantId } = await createFixtureTenant(superuser, `Alumni Module E2E Tenant ${uniqueSuffix()}`);
  return { superuser, pool, tenantId };
}

async function tearDown(ctx: Ctx): Promise<void> {
  await ctx.pool.end();
  await ctx.superuser.end();
}

/** Direct SQL insert of a complete alumni_profiles row -- fast, reliable test setup, bypassing the API's own multipart upload path. */
async function giveCompleteAlumniProfile(
  ctx: Ctx,
  collegeUserId: string,
  overrides: { company?: string; mentorshipAvailable?: boolean } = {},
): Promise<void> {
  await ctx.superuser.query(
    `insert into public.alumni_profiles
       (tenant_id, college_user_id, avatar_path, bio, phone, linkedin_url, company, job_title, skills, country, city, years_of_experience, mentorship_available)
     values ($1, $2, 'fake/avatar.jpg', 'A short bio', '+1-555-0100', 'https://linkedin.com/in/example',
             $3, 'Engineer', array['TypeScript','SQL'], 'USA', 'Metropolis', 5, $4)`,
    [ctx.tenantId, collegeUserId, overrides.company ?? "Acme Corp", overrides.mentorshipAvailable ?? true],
  );
}

/** Direct SQL insert of a complete student_profiles row -- students also need a complete profile to send a request. */
async function giveCompleteStudentProfile(ctx: Ctx, collegeUserId: string): Promise<void> {
  await ctx.superuser.query(
    `insert into public.student_profiles (tenant_id, college_user_id, avatar_path, linkedin_url)
     values ($1, $2, 'fake/avatar.jpg', 'https://linkedin.com/in/example')`,
    [ctx.tenantId, collegeUserId],
  );
}

test("a student cannot call any /alumni admin endpoint", async () => {
  const ctx = await setUp();
  try {
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });

    const list = await request(app).get("/alumni").set("Authorization", student.authHeader);
    assert.equal(list.status, 403);

    const create = await request(app).post("/alumni").set("Authorization", student.authHeader).send({ name: "X", email: "x@example.com" });
    assert.equal(create.status, 403);
  } finally {
    await tearDown(ctx);
  }
});

test("a college_admin cannot call /opportunities or /requests/:id/respond (alumni-only)", async () => {
  const ctx = await setUp();
  try {
    const admin = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "college_admin" });

    const create = await request(app)
      .post("/opportunities")
      .set("Authorization", admin.authHeader)
      .send({ type: "job", title: "Software Engineer" });
    assert.equal(create.status, 403);

    const respond = await request(app)
      .patch(`/requests/${crypto.randomUUID()}/respond`)
      .set("Authorization", admin.authHeader)
      .send({ status: "accepted" });
    assert.equal(respond.status, 403);
  } finally {
    await tearDown(ctx);
  }
});

test("an alumnus cannot call the admin /alumni/:id edit endpoint, on themselves or anyone else", async () => {
  const ctx = await setUp();
  try {
    const alumnus = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "alumni" });
    const { collegeUserId: otherAlumnusId } = await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, role: "alumni" });

    const editSelf = await request(app)
      .patch(`/alumni/${alumnus.collegeUserId}`)
      .set("Authorization", alumnus.authHeader)
      .send({ name: "New Name" });
    assert.equal(editSelf.status, 403);

    const editOther = await request(app)
      .patch(`/alumni/${otherAlumnusId}`)
      .set("Authorization", alumnus.authHeader)
      .send({ name: "New Name" });
    assert.equal(editOther.status, 403);
  } finally {
    await tearDown(ctx);
  }
});

test("POST /requests rejects a referral with no opportunityId, and a mentorship with one, at the route", async () => {
  const ctx = await setUp();
  try {
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });
    await giveCompleteStudentProfile(ctx, student.collegeUserId);
    const { collegeUserId: alumnusId } = await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, role: "alumni" });
    await giveCompleteAlumniProfile(ctx, alumnusId);

    const referralNoOpportunity = await request(app)
      .post("/requests")
      .set("Authorization", student.authHeader)
      .send({ alumnusId, type: "referral", message: "please refer me" });
    assert.equal(referralNoOpportunity.status, 400);

    const opportunity = await ctx.superuser.query<{ id: string }>(
      `insert into public.opportunities (tenant_id, posted_by_college_user_id, type, title, status)
       values ($1, $2, 'referral', 'Referral posting', 'open') returning id`,
      [ctx.tenantId, alumnusId],
    );
    const mentorshipWithOpportunity = await request(app)
      .post("/requests")
      .set("Authorization", student.authHeader)
      .send({ alumnusId, type: "mentorship", opportunityId: opportunity.rows[0].id, message: "please mentor me" });
    assert.equal(mentorshipWithOpportunity.status, 400);
  } finally {
    await tearDown(ctx);
  }
});

test("POST /requests rejects a referral against a job/internship opportunity, and against another alumnus's opportunity", async () => {
  const ctx = await setUp();
  try {
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });
    await giveCompleteStudentProfile(ctx, student.collegeUserId);
    const { collegeUserId: alumnusId } = await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, role: "alumni" });
    await giveCompleteAlumniProfile(ctx, alumnusId);
    const { collegeUserId: otherAlumnusId } = await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, role: "alumni" });
    await giveCompleteAlumniProfile(ctx, otherAlumnusId);

    const jobPosting = await ctx.superuser.query<{ id: string }>(
      `insert into public.opportunities (tenant_id, posted_by_college_user_id, type, title, status)
       values ($1, $2, 'job', 'A job posting', 'open') returning id`,
      [ctx.tenantId, alumnusId],
    );
    const wrongType = await request(app)
      .post("/requests")
      .set("Authorization", student.authHeader)
      .send({ alumnusId, type: "referral", opportunityId: jobPosting.rows[0].id, message: "please refer me" });
    assert.equal(wrongType.status, 400);

    const someoneElsesReferral = await ctx.superuser.query<{ id: string }>(
      `insert into public.opportunities (tenant_id, posted_by_college_user_id, type, title, status)
       values ($1, $2, 'referral', 'A different alumnus''s referral', 'open') returning id`,
      [ctx.tenantId, otherAlumnusId],
    );
    const wrongOwner = await request(app)
      .post("/requests")
      .set("Authorization", student.authHeader)
      .send({ alumnusId, type: "referral", opportunityId: someoneElsesReferral.rows[0].id, message: "please refer me" });
    assert.equal(wrongOwner.status, 400);
  } finally {
    await tearDown(ctx);
  }
});

test("an incomplete-profile alumnus does not appear in GET /alumni-directory and cannot receive requests or post opportunities", async () => {
  const ctx = await setUp();
  try {
    const incompleteAlumnus = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "alumni" });
    // No alumni_profiles row at all -- the least complete state.
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });
    await giveCompleteStudentProfile(ctx, student.collegeUserId);

    const directory = await request(app).get("/alumni-directory").set("Authorization", student.authHeader);
    assert.equal(directory.status, 200);
    assert.ok(!directory.body.alumni.some((a: { id: string }) => a.id === incompleteAlumnus.collegeUserId));

    const directoryDetail = await request(app)
      .get(`/alumni-directory/${incompleteAlumnus.collegeUserId}`)
      .set("Authorization", student.authHeader);
    assert.equal(directoryDetail.status, 404);

    const sendRequest = await request(app)
      .post("/requests")
      .set("Authorization", student.authHeader)
      .send({ alumnusId: incompleteAlumnus.collegeUserId, type: "mentorship", message: "hi" });
    assert.equal(sendRequest.status, 404);

    const postOpportunity = await request(app)
      .post("/opportunities")
      .set("Authorization", incompleteAlumnus.authHeader)
      .send({ type: "job", title: "Should be rejected" });
    assert.equal(postOpportunity.status, 400);
  } finally {
    await tearDown(ctx);
  }
});

test("an alumnus can update mentorship availability via PATCH /me/profile, reflected on the next GET", async () => {
  const ctx = await setUp();
  try {
    const alumnus = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "alumni" });
    await giveCompleteAlumniProfile(ctx, alumnus.collegeUserId);

    const before = await request(app).get("/me/profile").set("Authorization", alumnus.authHeader);
    assert.equal(before.body.mentorshipAvailable, true);

    const patchResponse = await request(app)
      .patch("/me/profile")
      .set("Authorization", alumnus.authHeader)
      .field("mentorshipAvailable", "false");
    assert.equal(patchResponse.status, 200);

    const after = await request(app).get("/me/profile").set("Authorization", alumnus.authHeader);
    assert.equal(after.body.mentorshipAvailable, false);
  } finally {
    await tearDown(ctx);
  }
});

test("mentorship requests are rejected for an alumnus who opted out, but referral requests to the same alumnus still succeed", async () => {
  const ctx = await setUp();
  try {
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });
    await giveCompleteStudentProfile(ctx, student.collegeUserId);
    const { collegeUserId: alumnusId } = await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, role: "alumni" });
    await giveCompleteAlumniProfile(ctx, alumnusId, { mentorshipAvailable: false });

    const mentorshipRequest = await request(app)
      .post("/requests")
      .set("Authorization", student.authHeader)
      .send({ alumnusId, type: "mentorship", message: "please mentor me" });
    assert.equal(mentorshipRequest.status, 404);

    const opportunity = await ctx.superuser.query<{ id: string }>(
      `insert into public.opportunities (tenant_id, posted_by_college_user_id, type, title, status)
       values ($1, $2, 'referral', 'Referral posting', 'open') returning id`,
      [ctx.tenantId, alumnusId],
    );
    // Regression guard: opting out of mentorship must not affect referral
    // requests, opportunity posting, or directory/eligibility otherwise.
    const referralRequest = await request(app)
      .post("/requests")
      .set("Authorization", student.authHeader)
      .send({ alumnusId, type: "referral", opportunityId: opportunity.rows[0].id, message: "please refer me" });
    assert.equal(referralRequest.status, 201);
  } finally {
    await tearDown(ctx);
  }
});

test("GET /alumni-directory and /alumni-directory/:id surface mentorshipAvailable for both true and false", async () => {
  const ctx = await setUp();
  try {
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });
    const { collegeUserId: availableId } = await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, role: "alumni" });
    await giveCompleteAlumniProfile(ctx, availableId, { mentorshipAvailable: true });
    const { collegeUserId: unavailableId } = await createFixtureCollegeUser(ctx.superuser, { tenantId: ctx.tenantId, role: "alumni" });
    await giveCompleteAlumniProfile(ctx, unavailableId, { mentorshipAvailable: false });

    const list = await request(app).get("/alumni-directory").set("Authorization", student.authHeader);
    assert.equal(list.status, 200);
    const available = list.body.alumni.find((a: { id: string }) => a.id === availableId);
    const unavailable = list.body.alumni.find((a: { id: string }) => a.id === unavailableId);
    assert.equal(available.mentorshipAvailable, true);
    assert.equal(unavailable.mentorshipAvailable, false);

    const detail = await request(app).get(`/alumni-directory/${unavailableId}`).set("Authorization", student.authHeader);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.mentorshipAvailable, false);
  } finally {
    await tearDown(ctx);
  }
});

test("responding to an already-accepted request returns 409, not a silent overwrite", async () => {
  const ctx = await setUp();
  try {
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });
    const alumnus = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "alumni" });

    const requestRow = await ctx.superuser.query<{ id: string }>(
      `insert into public.requests (tenant_id, student_college_user_id, alumnus_college_user_id, type, message, status)
       values ($1, $2, $3, 'mentorship', 'hi', 'accepted') returning id`,
      [ctx.tenantId, student.collegeUserId, alumnus.collegeUserId],
    );

    const respond = await request(app)
      .patch(`/requests/${requestRow.rows[0].id}/respond`)
      .set("Authorization", alumnus.authHeader)
      .send({ status: "declined" });
    assert.equal(respond.status, 409);

    const stillAccepted = await ctx.superuser.query<{ status: string }>(`select status from public.requests where id = $1`, [
      requestRow.rows[0].id,
    ]);
    assert.equal(stillAccepted.rows[0].status, "accepted");
  } finally {
    await tearDown(ctx);
  }
});

test("deleting an opportunity with an existing request against it returns 409, not a raw database error", async () => {
  const ctx = await setUp();
  try {
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });
    const alumnus = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "alumni" });

    const opportunity = await ctx.superuser.query<{ id: string }>(
      `insert into public.opportunities (tenant_id, posted_by_college_user_id, type, title, status)
       values ($1, $2, 'referral', 'Referral posting', 'open') returning id`,
      [ctx.tenantId, alumnus.collegeUserId],
    );
    await ctx.superuser.query(
      `insert into public.requests (tenant_id, student_college_user_id, alumnus_college_user_id, type, opportunity_id, message)
       values ($1, $2, $3, 'referral', $4, 'please refer me')`,
      [ctx.tenantId, student.collegeUserId, alumnus.collegeUserId, opportunity.rows[0].id],
    );

    const deleteResponse = await request(app)
      .delete(`/opportunities/${opportunity.rows[0].id}`)
      .set("Authorization", alumnus.authHeader);
    assert.equal(deleteResponse.status, 409);

    const stillExists = await ctx.superuser.query(`select id from public.opportunities where id = $1`, [opportunity.rows[0].id]);
    assert.equal(stillExists.rows.length, 1);
  } finally {
    await tearDown(ctx);
  }
});

test("end to end: alumni profile lazy-creates on first PATCH /me/profile, then supports posting and accepting a referral request", async () => {
  const ctx = await setUp();
  try {
    const alumnus = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "alumni" });
    const student = await createFixtureActor(ctx.superuser, ctx.pool, ctx.tenantId, { role: "student" });
    await giveCompleteStudentProfile(ctx, student.collegeUserId);

    const beforeProfile = await ctx.superuser.query(`select id from public.alumni_profiles where college_user_id = $1`, [
      alumnus.collegeUserId,
    ]);
    assert.equal(beforeProfile.rows.length, 0);

    // No alumni_profiles row exists yet -- this PATCH is what creates it.
    const patchResponse = await request(app)
      .patch("/me/profile")
      .set("Authorization", alumnus.authHeader)
      .field("bio", "A short bio")
      .field("phone", "+1-555-0100")
      .field("linkedinUrl", "https://linkedin.com/in/example")
      .field("company", "Acme Corp")
      .field("jobTitle", "Engineer")
      .field("skills", JSON.stringify(["TypeScript"]))
      .field("country", "USA")
      .field("city", "Metropolis")
      .field("yearsOfExperience", "5");
    assert.equal(patchResponse.status, 200);

    // avatar_path is required for completeness too -- set directly since
    // this test isn't exercising the upload pipeline itself.
    await ctx.superuser.query(`update public.alumni_profiles set avatar_path = 'fake/avatar.jpg' where college_user_id = $1`, [
      alumnus.collegeUserId,
    ]);

    const getResponse = await request(app).get("/me/profile").set("Authorization", alumnus.authHeader);
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.profileComplete, true);

    const postResponse = await request(app)
      .post("/opportunities")
      .set("Authorization", alumnus.authHeader)
      .send({ type: "referral", title: "Referral for a friend" });
    assert.equal(postResponse.status, 201);
    const opportunityId = postResponse.body.id;

    const requestResponse = await request(app)
      .post("/requests")
      .set("Authorization", student.authHeader)
      .send({ alumnusId: alumnus.collegeUserId, type: "referral", opportunityId, message: "please refer me" });
    assert.equal(requestResponse.status, 201);
    const requestId = requestResponse.body.id;

    const acceptResponse = await request(app)
      .patch(`/requests/${requestId}/respond`)
      .set("Authorization", alumnus.authHeader)
      .send({ status: "accepted", responseMessage: "happy to help" });
    assert.equal(acceptResponse.status, 200);

    const sentResponse = await request(app).get("/requests/sent").set("Authorization", student.authHeader);
    assert.equal(sentResponse.status, 200);
    const sent = sentResponse.body.requests.find((r: { id: string }) => r.id === requestId);
    assert.equal(sent.status, "accepted");
    assert.equal(sent.responseMessage, "happy to help");
  } finally {
    await tearDown(ctx);
  }
});
