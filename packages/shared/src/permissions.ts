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
  // Phase 2: Alumni module.
  ALUMNI_IMPORT: "alumni.import",
  ALUMNI_INVITE: "alumni.invite",
  ALUMNI_EDIT_MANAGED_FIELDS: "alumni.editManagedFields",
  ALUMNI_DEACTIVATE: "alumni.deactivate",
  ALUMNI_DIRECTORY_VIEW: "alumniDirectory.view",
  OPPORTUNITY_CREATE: "opportunity.create",
  OPPORTUNITY_MANAGE: "opportunity.manage",
  OPPORTUNITY_VIEW: "opportunity.view",
  REQUEST_SEND: "request.send",
  REQUEST_RESPOND: "request.respond",
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
    // Phase 2: college admins onboard and manage alumni exactly like students.
    PERMISSIONS.ALUMNI_IMPORT,
    PERMISSIONS.ALUMNI_INVITE,
    PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS,
    PERMISSIONS.ALUMNI_DEACTIVATE,
  ],
  student: [
    PERMISSIONS.PROFILE_EDIT_OWN,
    PERMISSIONS.PASSWORD_TRIGGER_RESET,
    // Phase 2: browsing alumni and sending mentorship/referral requests.
    PERMISSIONS.ALUMNI_DIRECTORY_VIEW,
    PERMISSIONS.OPPORTUNITY_VIEW,
    PERMISSIONS.REQUEST_SEND,
  ],
  // Phase 2: alumni have their own profile, post opportunities, and respond
  // to requests. No DASHBOARD_VIEW grant -- that permission means the
  // college-wide stats dashboard, which alumni never see; the alumni
  // dashboard page composes the capabilities below instead.
  alumni: [
    PERMISSIONS.PROFILE_EDIT_OWN,
    PERMISSIONS.PASSWORD_TRIGGER_RESET,
    PERMISSIONS.OPPORTUNITY_CREATE,
    PERMISSIONS.OPPORTUNITY_MANAGE,
    PERMISSIONS.REQUEST_RESPOND,
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Which permission gates inviting a person into a given target role.
 * Per spec 7.1/7.3: super_admin and college_admin can both invite a
 * college_admin (a second placement officer at the same college); only
 * college_admin can invite a student or (Phase 2) an alumnus. Inviting a
 * super_admin isn't part of this map at all -- that stays out of API scope
 * (ops/seed only).
 */
export const INVITE_TARGET_PERMISSION: Record<"college_admin" | "student" | "alumni", Permission> = {
  college_admin: PERMISSIONS.COLLEGE_ADMIN_INVITE,
  student: PERMISSIONS.STUDENT_INVITE,
  alumni: PERMISSIONS.ALUMNI_INVITE,
};
