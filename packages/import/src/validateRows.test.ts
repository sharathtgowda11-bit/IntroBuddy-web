import assert from "node:assert/strict";
import { test } from "node:test";
import { validateImportRows, type MappedStudentRow, type ValidationContext } from "./validateRows.js";

const CSE_DEPARTMENT = { departmentId: "dept-cse", degreeId: "degree-btech" };

function baseContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    currentYear: 2026,
    existingUsns: new Set(),
    existingEmails: new Set(),
    departmentsByName: new Map([["computer science", CSE_DEPARTMENT]]),
    ...overrides,
  };
}

function validRow(overrides: Partial<MappedStudentRow> = {}): MappedStudentRow {
  return {
    rowNumber: 1,
    name: "Jane Student",
    usn: "1RV20CS001",
    email: "jane@example.com",
    departmentName: "Computer Science",
    graduationYear: "2027",
    ...overrides,
  };
}

test("a fully valid new row is classified as create", () => {
  const [outcome] = validateImportRows([validRow()], baseContext());
  assert.equal(outcome.outcome, "create");
  if (outcome.outcome === "create") {
    assert.equal(outcome.data.departmentId, CSE_DEPARTMENT.departmentId);
    assert.equal(outcome.data.degreeId, CSE_DEPARTMENT.degreeId);
    assert.equal(outcome.data.graduationYear, 2027);
  }
});

test("a row matching an existing USN is classified as update, not create", () => {
  const ctx = baseContext({ existingUsns: new Set(["1rv20cs001"]) });
  const [outcome] = validateImportRows([validRow()], ctx);
  assert.equal(outcome.outcome, "update");
});

test("missing required fields are each reported", () => {
  const [outcome] = validateImportRows(
    [validRow({ name: "", usn: "", email: "", departmentName: "", graduationYear: "" })],
    baseContext(),
  );
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.includes("missing name"));
    assert.ok(outcome.reasons.includes("missing USN"));
    assert.ok(outcome.reasons.includes("missing email"));
    assert.ok(outcome.reasons.includes("missing department"));
    assert.ok(outcome.reasons.includes("missing graduation year"));
  }
});

test("an invalid email format is rejected", () => {
  const [outcome] = validateImportRows([validRow({ email: "not-an-email" })], baseContext());
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.includes("invalid email format"));
  }
});

test("a graduation year outside the plausible range is rejected", () => {
  const [outcome] = validateImportRows([validRow({ graduationYear: "1850" })], baseContext());
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.some((r) => r.includes("out of plausible range")));
  }
});

test("a non-numeric graduation year is rejected", () => {
  const [outcome] = validateImportRows([validRow({ graduationYear: "twenty-twenty-seven" })], baseContext());
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.includes("graduation year is not a number"));
  }
});

test("a department not in this tenant's hierarchy is rejected", () => {
  const [outcome] = validateImportRows([validRow({ departmentName: "Astrophysics" })], baseContext());
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.some((r) => r.includes("not found in this college's hierarchy")));
  }
});

test("the same USN appearing twice in one file rejects both rows, neither imported", () => {
  const outcomes = validateImportRows(
    [validRow({ rowNumber: 1, email: "a@example.com" }), validRow({ rowNumber: 2, email: "b@example.com" })],
    baseContext(),
  );
  assert.equal(outcomes[0].outcome, "reject");
  assert.equal(outcomes[1].outcome, "reject");
  for (const outcome of outcomes) {
    if (outcome.outcome === "reject") {
      assert.ok(outcome.reasons.includes("duplicate USN within this file"));
    }
  }
});

test("the same email appearing twice in one file rejects both rows, neither imported", () => {
  const outcomes = validateImportRows(
    [validRow({ rowNumber: 1, usn: "1RV20CS001" }), validRow({ rowNumber: 2, usn: "1RV20CS002" })],
    baseContext(),
  );
  assert.equal(outcomes[0].outcome, "reject");
  assert.equal(outcomes[1].outcome, "reject");
  for (const outcome of outcomes) {
    if (outcome.outcome === "reject") {
      assert.ok(outcome.reasons.includes("duplicate email within this file"));
    }
  }
});

test("a new row whose email is already used by a different student in this tenant is rejected", () => {
  const ctx = baseContext({ existingEmails: new Set(["jane@example.com"]) });
  // A different USN than any existing row -- so this isn't an update, it's
  // a would-be create colliding with another student's email.
  const [outcome] = validateImportRows([validRow({ usn: "1RV20CS999" })], ctx);
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.includes("email already in use by another student in this college"));
  }
});

test("an email that only exists in another tenant is not flagged (existingEmails is tenant-scoped by the caller)", () => {
  // Spec: "Email belongs to an identity in another college -- expected
  // and permitted... do not error." Since existingEmails is populated by
  // the caller from a tenant-scoped query, an email from a different
  // tenant simply won't appear in this set -- nothing special to do here,
  // which this test makes explicit.
  const ctx = baseContext({ existingEmails: new Set() });
  const [outcome] = validateImportRows([validRow()], ctx);
  assert.equal(outcome.outcome, "create");
});
