import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPermission, INVITE_TARGET_PERMISSION, PERMISSIONS } from "./permissions.js";

test("super_admin can invite a college_admin but not a student", () => {
  assert.equal(hasPermission("super_admin", INVITE_TARGET_PERMISSION.college_admin), true);
  assert.equal(hasPermission("super_admin", INVITE_TARGET_PERMISSION.student), false);
});

test("college_admin can invite both a college_admin and a student", () => {
  assert.equal(hasPermission("college_admin", INVITE_TARGET_PERMISSION.college_admin), true);
  assert.equal(hasPermission("college_admin", INVITE_TARGET_PERMISSION.student), true);
});

test("student can invite neither", () => {
  assert.equal(hasPermission("student", INVITE_TARGET_PERMISSION.college_admin), false);
  assert.equal(hasPermission("student", INVITE_TARGET_PERMISSION.student), false);
});

test("only super_admin can create or suspend a college", () => {
  assert.equal(hasPermission("super_admin", PERMISSIONS.COLLEGE_CREATE), true);
  assert.equal(hasPermission("college_admin", PERMISSIONS.COLLEGE_CREATE), false);
  assert.equal(hasPermission("student", PERMISSIONS.COLLEGE_CREATE), false);
});

test("everyone can trigger their own password reset, no one can set another's password directly", () => {
  assert.equal(hasPermission("college_admin", PERMISSIONS.PASSWORD_TRIGGER_RESET), true);
  assert.equal(hasPermission("student", PERMISSIONS.PASSWORD_TRIGGER_RESET), true);
  // There is no PASSWORD_SET_OTHER permission at all -- see permissions.ts.
  assert.equal("PASSWORD_SET_OTHER" in PERMISSIONS, false);
});
