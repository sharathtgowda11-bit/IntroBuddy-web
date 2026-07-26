import assert from "node:assert/strict";
import { test } from "node:test";
import { guessAlumniColumnMapping } from "./guessColumnMapping.js";

test("guesses common alumni header aliases regardless of casing/punctuation", () => {
  const mapping = guessAlumniColumnMapping(["Full Name", "Email Address", "Current Company", "Dept", "Batch"]);
  assert.equal(mapping.name, "Full Name");
  assert.equal(mapping.email, "Email Address");
  assert.equal(mapping.company, "Current Company");
  assert.equal(mapping.department, "Dept");
  assert.equal(mapping.graduationYear, "Batch");
});

test("has no usn field at all -- alumni have none", () => {
  const mapping = guessAlumniColumnMapping(["USN", "Name", "Email"]);
  assert.equal((mapping as Record<string, unknown>).usn, undefined);
});

test("leaves a field unmapped when no header matches any known alias", () => {
  const mapping = guessAlumniColumnMapping(["Name", "Some Unrelated Column"]);
  assert.equal(mapping.name, "Name");
  assert.equal(mapping.company, undefined);
});
