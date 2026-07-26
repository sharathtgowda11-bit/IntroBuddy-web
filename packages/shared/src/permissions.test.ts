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
  assert.equal(hasPermission("alumni", PERMISSIONS.PASSWORD_TRIGGER_RESET), true);
  // There is no PASSWORD_SET_OTHER permission at all -- see permissions.ts.
  assert.equal("PASSWORD_SET_OTHER" in PERMISSIONS, false);
});

// Phase 2: Alumni module.

test("college_admin can invite an alumnus; no one else can", () => {
  assert.equal(hasPermission("college_admin", INVITE_TARGET_PERMISSION.alumni), true);
  assert.equal(hasPermission("super_admin", INVITE_TARGET_PERMISSION.alumni), false);
  assert.equal(hasPermission("student", INVITE_TARGET_PERMISSION.alumni), false);
  assert.equal(hasPermission("alumni", INVITE_TARGET_PERMISSION.alumni), false);
});

test("only college_admin manages alumni rows; only alumni manage their own postings", () => {
  assert.equal(hasPermission("college_admin", PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS), true);
  assert.equal(hasPermission("alumni", PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS), false);
  assert.equal(hasPermission("alumni", PERMISSIONS.OPPORTUNITY_MANAGE), true);
  assert.equal(hasPermission("college_admin", PERMISSIONS.OPPORTUNITY_MANAGE), false);
});

test("students browse the alumni directory and send requests; alumni respond to them", () => {
  assert.equal(hasPermission("student", PERMISSIONS.ALUMNI_DIRECTORY_VIEW), true);
  assert.equal(hasPermission("student", PERMISSIONS.REQUEST_SEND), true);
  assert.equal(hasPermission("student", PERMISSIONS.REQUEST_RESPOND), false);
  assert.equal(hasPermission("alumni", PERMISSIONS.REQUEST_RESPOND), true);
  assert.equal(hasPermission("alumni", PERMISSIONS.REQUEST_SEND), false);
});

test("alumni never see the college-wide dashboard", () => {
  assert.equal(hasPermission("alumni", PERMISSIONS.DASHBOARD_VIEW), false);
});
