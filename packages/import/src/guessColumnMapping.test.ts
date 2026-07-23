import assert from "node:assert/strict";
import { test } from "node:test";
import { guessColumnMapping } from "./guessColumnMapping.js";

test("guesses common header aliases regardless of casing/punctuation", () => {
  const mapping = guessColumnMapping(["Full Name", "Roll No.", "Email Address", "Dept", "Batch"]);
  assert.equal(mapping.name, "Full Name");
  assert.equal(mapping.usn, "Roll No.");
  assert.equal(mapping.email, "Email Address");
  assert.equal(mapping.department, "Dept");
  assert.equal(mapping.graduationYear, "Batch");
});

test("leaves a field unmapped when no header matches any known alias", () => {
  const mapping = guessColumnMapping(["Name", "Some Unrelated Column"]);
  assert.equal(mapping.name, "Name");
  assert.equal(mapping.usn, undefined);
});

test("never assumes a fixed template -- different colleges' headers all resolve to the same target fields", () => {
  const mappingA = guessColumnMapping(["USN", "Email"]);
  const mappingB = guessColumnMapping(["Register Number", "Mail ID"]);
  assert.equal(mappingA.usn, "USN");
  assert.equal(mappingB.usn, "Register Number");
  assert.equal(mappingA.email, "Email");
  assert.equal(mappingB.email, "Mail ID");
});
