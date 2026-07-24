/** Matches the check constraint on college_users.role in the tenancy migration. */
export type Role = "super_admin" | "college_admin" | "student";

/** Matches the check constraint on college_users.status, extended with 'deactivated' in the student_administration migration. */
export type CollegeUserStatus = "invited" | "active" | "deactivated";

/** Matches the check constraint on tenants.status in the college_onboarding migration. */
export type TenantStatus = "provisioning" | "active" | "suspended";
