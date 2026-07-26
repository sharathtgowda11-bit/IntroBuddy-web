/** Matches the check constraint on college_users.role, widened for 'alumni' in the alumni_module migration (Phase 2). */
export type Role = "super_admin" | "college_admin" | "student" | "alumni";

/** Matches the check constraint on college_users.status, extended with 'deactivated' in the student_administration migration. */
export type CollegeUserStatus = "invited" | "active" | "deactivated";

/** Matches the check constraint on tenants.status in the college_onboarding migration. */
export type TenantStatus = "provisioning" | "active" | "suspended";
