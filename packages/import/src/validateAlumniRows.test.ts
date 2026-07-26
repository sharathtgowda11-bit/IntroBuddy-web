import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAlumniRows, type AlumniValidationContext, type MappedAlumniRow } from "./validateAlumniRows.js";

const CSE_DEPARTMENT = { departmentId: "dept-cse", degreeId: "degree-btech", degreeName: "B.Tech" };

function baseContext(overrides: Partial<AlumniValidationContext> = {}): AlumniValidationContext {
  return {
    currentYear: 2026,
    existingAlumniEmails: new Set(),
    existingNonAlumniEmails: new Set(),
    departmentsByName: new Map([["computer science", [CSE_DEPARTMENT]]]),
    ...overrides,
  };
}

function validRow(overrides: Partial<MappedAlumniRow> = {}): MappedAlumniRow {
  return {
    rowNumber: 1,
    name: "Siri Alumna",
    email: "siri@example.com",
    company: "Acme Corp",
    departmentName: "Computer Science",
    graduationYear: "2020",
    ...overrides,
  };
}

test("a fully valid new row is classified as create", () => {
  const [outcome] = validateAlumniRows([validRow()], baseContext());
  assert.equal(outcome.outcome, "create");
  if (outcome.outcome === "create") {
    assert.equal(outcome.data.departmentId, CSE_DEPARTMENT.departmentId);
    assert.equal(outcome.data.degreeId, CSE_DEPARTMENT.degreeId);
    assert.equal(outcome.data.graduationYear, 2020);
    assert.equal(outcome.data.company, "Acme Corp");
  }
});

test("department, degree, and graduation year are all optional -- a row with none of them still creates", () => {
  const [outcome] = validateAlumniRows(
    [validRow({ departmentName: undefined, graduationYear: undefined })],
    baseContext(),
  );
  assert.equal(outcome.outcome, "create");
  if (outcome.outcome === "create") {
    assert.equal(outcome.data.departmentId, undefined);
    assert.equal(outcome.data.degreeId, undefined);
    assert.equal(outcome.data.graduationYear, undefined);
  }
});

test("a row matching an existing alumnus's email is classified as update, not create", () => {
  const ctx = baseContext({ existingAlumniEmails: new Set(["siri@example.com"]) });
  const [outcome] = validateAlumniRows([validRow()], ctx);
  assert.equal(outcome.outcome, "update");
});

test("missing name, email, or company are each reported -- department/graduation year are not required", () => {
  const [outcome] = validateAlumniRows(
    [validRow({ name: "", email: "", company: "", departmentName: undefined, graduationYear: undefined })],
    baseContext(),
  );
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.includes("missing name"));
    assert.ok(outcome.reasons.includes("missing email"));
    assert.ok(outcome.reasons.includes("missing company"));
    assert.ok(!outcome.reasons.some((r) => r.includes("department")));
    assert.ok(!outcome.reasons.some((r) => r.includes("graduation")));
  }
});

test("an invalid email format is rejected", () => {
  const [outcome] = validateAlumniRows([validRow({ email: "not-an-email" })], baseContext());
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.includes("invalid email format"));
  }
});

test("a graduation year outside the plausible range is rejected", () => {
  const [outcome] = validateAlumniRows([validRow({ graduationYear: "1850" })], baseContext());
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.some((r) => r.includes("out of plausible range")));
  }
});

test("a department not in this tenant's hierarchy is rejected", () => {
  const [outcome] = validateAlumniRows([validRow({ departmentName: "Astrophysics" })], baseContext());
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.some((r) => r.includes("not found in this college's hierarchy")));
  }
});

// Regression: same ambiguity risk as the student import -- a department
// name shared by more than one degree must never be silently misassigned.
const BTECH_CSE = { departmentId: "dept-cse-btech", degreeId: "degree-btech", degreeName: "B.Tech" };
const MTECH_CSE = { departmentId: "dept-cse-mtech", degreeId: "degree-mtech", degreeName: "M.Tech" };
function ambiguousContext(): AlumniValidationContext {
  return baseContext({ departmentsByName: new Map([["computer science", [BTECH_CSE, MTECH_CSE]]]) });
}

test("a department name shared by two degrees resolves correctly when the row's degree column disambiguates it", () => {
  const [outcome] = validateAlumniRows([validRow({ degreeName: "M.Tech" })], ambiguousContext());
  assert.equal(outcome.outcome, "create");
  if (outcome.outcome === "create") {
    assert.equal(outcome.data.departmentId, MTECH_CSE.departmentId);
    assert.equal(outcome.data.degreeId, MTECH_CSE.degreeId);
  }
});

test("a department name shared by two degrees is rejected -- not silently misassigned -- when no degree column disambiguates it", () => {
  const [outcome] = validateAlumniRows([validRow()], ambiguousContext());
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.some((r) => r.includes("more than one degree")));
  }
});

test("the same email appearing twice in one file rejects both rows, neither imported", () => {
  const outcomes = validateAlumniRows(
    [validRow({ rowNumber: 1 }), validRow({ rowNumber: 2 })],
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

test("a new row whose email is already used by a non-alumnus in this tenant is rejected", () => {
  const ctx = baseContext({ existingNonAlumniEmails: new Set(["siri@example.com"]) });
  const [outcome] = validateAlumniRows([validRow()], ctx);
  assert.equal(outcome.outcome, "reject");
  if (outcome.outcome === "reject") {
    assert.ok(outcome.reasons.includes("email already in use by another user in this college"));
  }
});

test("an email that only exists in another tenant is not flagged (both email sets are tenant-scoped by the caller)", () => {
  const ctx = baseContext({ existingAlumniEmails: new Set(), existingNonAlumniEmails: new Set() });
  const [outcome] = validateAlumniRows([validRow()], ctx);
  assert.equal(outcome.outcome, "create");
});

test("company is validated as required but never appears on the create/update outcome as anything but data.company (never persisted downstream is a caller responsibility)", () => {
  const [outcome] = validateAlumniRows([validRow({ company: "  Globex  " })], baseContext());
  assert.equal(outcome.outcome, "create");
  if (outcome.outcome === "create") {
    assert.equal(outcome.data.company, "Globex");
  }
});
