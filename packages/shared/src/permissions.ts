import type { Role } from "./roles.js";

/**
 * The full permission matrix from the Phase 1 spec, section 7.3, encoded
 * once as data. Call sites must check hasPermission(role, PERMISSION),
 * never compare a role string directly -- adding a role later is then an
 * edit to ROLE_PERMISSIONS below, not a refactor across the codebase.
 *
 * "Set another user's password" is deliberately absent: no role ever
 * holds it (spec 14.1 #6). That capability doesn't exist as a gated
 * permission because the corresponding API route doesn't exist at all.
 */
export const PERMISSIONS = {
  COLLEGE_CREATE: "college.create",
  COLLEGE_SUSPEND: "college.suspend",
  COLLEGE_VIEW_ALL: "college.viewAll",
  COLLEGE_ADMIN_INVITE: "collegeAdmin.invite",
  COLLEGE_EDIT_PROFILE: "college.editProfile",
  DEGREE_MANAGE: "degree.manage",
  STUDENT_IMPORT: "student.import",
  STUDENT_INVITE: "student.invite",
  STUDENT_EDIT_MANAGED_FIELDS: "student.editManagedFields",
  PROFILE_EDIT_OWN: "profile.editOwn",
  PASSWORD_TRIGGER_RESET: "password.triggerReset",
  STUDENT_DEACTIVATE: "student.deactivate",
  DASHBOARD_VIEW: "dashboard.view",
  AUDIT_LOG_VIEW: "auditLog.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: [
    PERMISSIONS.COLLEGE_CREATE,
    PERMISSIONS.COLLEGE_SUSPEND,
    PERMISSIONS.COLLEGE_VIEW_ALL,
    PERMISSIONS.COLLEGE_ADMIN_INVITE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.AUDIT_LOG_VIEW,
  ],
  college_admin: [
    PERMISSIONS.COLLEGE_ADMIN_INVITE,
    PERMISSIONS.COLLEGE_EDIT_PROFILE,
    PERMISSIONS.DEGREE_MANAGE,
    PERMISSIONS.STUDENT_IMPORT,
    PERMISSIONS.STUDENT_INVITE,
    PERMISSIONS.STUDENT_EDIT_MANAGED_FIELDS,
    PERMISSIONS.PROFILE_EDIT_OWN,
    PERMISSIONS.PASSWORD_TRIGGER_RESET,
    PERMISSIONS.STUDENT_DEACTIVATE,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.AUDIT_LOG_VIEW,
  ],
  student: [PERMISSIONS.PROFILE_EDIT_OWN, PERMISSIONS.PASSWORD_TRIGGER_RESET],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Which permission gates inviting a person into a given target role.
 * Per spec 7.1/7.3: super_admin and college_admin can both invite a
 * college_admin (a second placement officer at the same college); only
 * college_admin can invite a student. Inviting a super_admin isn't part
 * of this map at all -- that stays out of API scope (ops/seed only).
 */
export const INVITE_TARGET_PERMISSION: Record<"college_admin" | "student", Permission> = {
  college_admin: PERMISSIONS.COLLEGE_ADMIN_INVITE,
  student: PERMISSIONS.STUDENT_INVITE,
};
