/** Matches the check constraint on college_users.role in the tenancy migration. */
export type Role = "super_admin" | "college_admin" | "student";

/** Matches the check constraint on college_users.status in the auth_invitations migration. */
export type CollegeUserStatus = "invited" | "active";

/** Matches the check constraint on tenants.status in the college_onboarding migration. */
export type TenantStatus = "provisioning" | "active" | "suspended";
