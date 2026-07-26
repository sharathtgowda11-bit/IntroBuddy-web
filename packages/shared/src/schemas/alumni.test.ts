import assert from "node:assert/strict";
import { test } from "node:test";
import { OpportunityCreateSchema, RequestCreateSchema } from "./alumni.js";

test("a referral request without an opportunityId is rejected before it reaches the database", () => {
  const result = RequestCreateSchema.safeParse({
    alumnusId: "00000000-0000-0000-0000-000000000001",
    type: "referral",
    message: "Could you refer me?",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((i) => i.path.includes("opportunityId")));
  }
});

test("a mentorship request with an opportunityId is rejected -- mentorship never references a posting", () => {
  const result = RequestCreateSchema.safeParse({
    alumnusId: "00000000-0000-0000-0000-000000000001",
    type: "mentorship",
    opportunityId: "00000000-0000-0000-0000-000000000002",
    message: "Could you mentor me?",
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((i) => i.path.includes("opportunityId")));
  }
});

test("a referral request with an opportunityId, and a mentorship request without one, both pass", () => {
  const referral = RequestCreateSchema.safeParse({
    alumnusId: "00000000-0000-0000-0000-000000000001",
    type: "referral",
    opportunityId: "00000000-0000-0000-0000-000000000002",
    message: "Could you refer me?",
  });
  assert.equal(referral.success, true);

  const mentorship = RequestCreateSchema.safeParse({
    alumnusId: "00000000-0000-0000-0000-000000000001",
    type: "mentorship",
    message: "Could you mentor me?",
  });
  assert.equal(mentorship.success, true);
});

test("an opportunity deadline in the past is rejected", () => {
  const result = OpportunityCreateSchema.safeParse({
    type: "job",
    title: "Software Engineer",
    deadline: "2000-01-01",
  });
  assert.equal(result.success, false);
});

test("an opportunity with no deadline, or a future one, is accepted", () => {
  const noDeadline = OpportunityCreateSchema.safeParse({ type: "job", title: "Software Engineer" });
  assert.equal(noDeadline.success, true);

  const futureDeadline = OpportunityCreateSchema.safeParse({
    type: "referral",
    title: "Referral for a friend",
    deadline: "2099-01-01",
  });
  assert.equal(futureDeadline.success, true);
});
