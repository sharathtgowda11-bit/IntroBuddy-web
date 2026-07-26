import { randomBytes } from "node:crypto";
import type { Client } from "pg";

export const SUPERUSER_URL =
  process.env.SUPABASE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
export const APP_URL =
  process.env.APP_DB_URL ?? "postgres://app_user:introbuddy_local_dev_only@127.0.0.1:54322/postgres";

/** A short, collision-resistant suffix for fixture emails/slugs within one test run. */
export function uniqueSuffix(): string {
  return `${Date.now()}-${randomBytes(4).toString("hex")}`;
}

export interface FixtureTenant {
  id: string;
  slug: string;
}

export async function createFixtureTenant(superuser: Client, name: string): Promise<FixtureTenant> {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uniqueSuffix()}`;
  const result = await superuser.query<{ id: string }>(
    `insert into public.tenants (name, slug) values ($1, $2) returning id`,
    [name, slug],
  );
  return { id: result.rows[0].id, slug };
}

/** Provisions a bare auth.users row -- enough to satisfy college_users' FK. Not a real, loginable identity. */
export async function createFixtureIdentity(superuser: Client, email: string): Promise<string> {
  const result = await superuser.query<{ id: string }>(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, now(), now(), now())
     returning id`,
    [email],
  );
  return result.rows[0].id;
}

export interface FixtureCollegeUser {
  tenantId: string;
  role?: "super_admin" | "college_admin" | "student" | "alumni";
  status?: "invited" | "active" | "deactivated";
  usn?: string;
  name?: string;
  departmentId?: string;
  graduationYear?: number;
}

/** Creates a fixture identity plus its college_users row together, and returns both ids. */
export async function createFixtureCollegeUser(
  superuser: Client,
  { tenantId, role = "student", status = "active", usn, name, departmentId, graduationYear }: FixtureCollegeUser,
): Promise<{ collegeUserId: string; userId: string; email: string }> {
  const email = `fixture-${uniqueSuffix()}@example.com`;
  const userId = await createFixtureIdentity(superuser, email);
  const result = await superuser.query<{ id: string }>(
    `insert into public.college_users (tenant_id, user_id, email, usn, name, department_id, graduation_year, role, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id`,
    [tenantId, userId, email, usn ?? null, name ?? null, departmentId ?? null, graduationYear ?? null, role, status],
  );
  return { collegeUserId: result.rows[0].id, userId, email };
}

/** A fixture degree + department pair -- for tests that invite/import a student, which now require a real departmentId. */
export async function createFixtureDepartment(
  superuser: Client,
  tenantId: string,
): Promise<{ degreeId: string; departmentId: string; name: string }> {
  const suffix = uniqueSuffix();
  const name = `Fixture Department ${suffix}`;
  const degreeResult = await superuser.query<{ id: string }>(
    `insert into public.degrees (tenant_id, name) values ($1, $2) returning id`,
    [tenantId, `Fixture Degree ${suffix}`],
  );
  const degreeId = degreeResult.rows[0].id;
  const departmentResult = await superuser.query<{ id: string }>(
    `insert into public.departments (tenant_id, degree_id, name) values ($1, $2, $3) returning id`,
    [tenantId, degreeId, name],
  );
  return { degreeId, departmentId: departmentResult.rows[0].id, name };
}

export interface FixtureOpportunity {
  tenantId: string;
  postedByCollegeUserId: string;
  type?: "job" | "internship" | "referral";
  title?: string;
}

/** Phase 2: a fixture opportunity row, for tests exercising requests.opportunity_id's composite FK. */
export async function createFixtureOpportunity(
  superuser: Client,
  { tenantId, postedByCollegeUserId, type = "referral", title }: FixtureOpportunity,
): Promise<{ id: string }> {
  const result = await superuser.query<{ id: string }>(
    `insert into public.opportunities (tenant_id, posted_by_college_user_id, type, title)
     values ($1, $2, $3, $4)
     returning id`,
    [tenantId, postedByCollegeUserId, type, title ?? `Fixture opportunity ${uniqueSuffix()}`],
  );
  return { id: result.rows[0].id };
}

/** A fixture-only stand-in for a real hashed token; the real hashing lives in apps/api's token utilities. */
export function fixtureTokenHash(): string {
  return randomBytes(32).toString("hex");
}

export function fixtureExpiry(hoursFromNow = 1): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}
