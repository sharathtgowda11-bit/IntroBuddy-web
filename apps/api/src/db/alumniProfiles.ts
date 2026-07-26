import type { CollegeUserStatus } from "@introbuddy/shared";
import type { PoolClient } from "pg";

/**
 * Complete when Step 1 fields (avatarPath, bio, phone, linkedinUrl) AND
 * Step 3 fields (company, jobTitle, skills, country, city,
 * yearsOfExperience) are all present -- Step 2 (the read-only graduation
 * block) never gates completeness. Computed, never stored (Part 4's
 * settled decision) -- this fragment is interpolated into every query that
 * needs the flag (list/directory/eligibility), and isAlumniProfileComplete
 * below is the same rule for callers that already have the row in JS
 * (GET /me/profile). Requires the caller to alias alumni_profiles as `ap`
 * (left join, since a brand-new alumnus has no row yet).
 */
export const ALUMNI_PROFILE_COMPLETE_SQL = `(
  ap.avatar_path is not null and ap.bio is not null and ap.phone is not null and ap.linkedin_url is not null
  and ap.company is not null and ap.job_title is not null
  and ap.skills is not null and array_length(ap.skills, 1) > 0
  and ap.country is not null and ap.city is not null and ap.years_of_experience is not null
)`;

export interface AlumniProfileCompletenessFields {
  avatarPath: string | null;
  bio: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  company: string | null;
  jobTitle: string | null;
  skills: string[] | null;
  country: string | null;
  city: string | null;
  yearsOfExperience: number | null;
}

/** JS-side mirror of ALUMNI_PROFILE_COMPLETE_SQL, for callers that already have the row (GET /me/profile). */
export function isAlumniProfileComplete(profile: AlumniProfileCompletenessFields): boolean {
  return (
    profile.avatarPath !== null &&
    profile.bio !== null &&
    profile.phone !== null &&
    profile.linkedinUrl !== null &&
    profile.company !== null &&
    profile.jobTitle !== null &&
    profile.skills !== null &&
    profile.skills.length > 0 &&
    profile.country !== null &&
    profile.city !== null &&
    profile.yearsOfExperience !== null
  );
}

export interface OwnAlumniProfileRecord {
  collegeUserId: string;
  name: string | null;
  email: string;
  graduationYear: number | null;
  collegeName: string | null;
  degreeName: string | null;
  departmentName: string | null;
  avatarPath: string | null;
  bio: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  company: string | null;
  jobTitle: string | null;
  skills: string[] | null;
  country: string | null;
  city: string | null;
  yearsOfExperience: number | null;
  workEmail: string | null;
}

interface OwnAlumniProfileRow {
  college_user_id: string;
  name: string | null;
  email: string;
  graduation_year: number | null;
  college_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  avatar_path: string | null;
  bio: string | null;
  phone: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  company: string | null;
  job_title: string | null;
  skills: string[] | null;
  country: string | null;
  city: string | null;
  years_of_experience: number | null;
  work_email: string | null;
}

function mapOwnProfileRow(row: OwnAlumniProfileRow): OwnAlumniProfileRecord {
  return {
    collegeUserId: row.college_user_id,
    name: row.name,
    email: row.email,
    graduationYear: row.graduation_year,
    collegeName: row.college_name,
    degreeName: row.degree_name,
    departmentName: row.department_name,
    avatarPath: row.avatar_path,
    bio: row.bio,
    phone: row.phone,
    linkedinUrl: row.linkedin_url,
    githubUrl: row.github_url,
    company: row.company,
    jobTitle: row.job_title,
    skills: row.skills,
    country: row.country,
    city: row.city,
    yearsOfExperience: row.years_of_experience,
    workEmail: row.work_email,
  };
}

/**
 * One combined read for GET /me/profile (alumni). College-managed fields
 * (name, email, degree, department, graduation year) come straight from
 * college_users and are read-only through this route -- Part 4's "Step 2
 * is a display, never an input" decision; self-authored fields come from
 * the one-to-one alumni_profiles row, which may not exist yet (left join),
 * mirroring getOwnProfile's identical shape for students.
 */
export async function getOwnAlumniProfile(client: PoolClient, collegeUserId: string): Promise<OwnAlumniProfileRecord | null> {
  const result = await client.query<OwnAlumniProfileRow>(
    `select
       cu.id as college_user_id, cu.name, cu.email, cu.graduation_year,
       t.name as college_name, d.name as degree_name, dept.name as department_name,
       ap.avatar_path, ap.bio, ap.phone, ap.linkedin_url, ap.github_url,
       ap.company, ap.job_title, ap.skills, ap.country, ap.city, ap.years_of_experience, ap.work_email
     from public.college_users cu
     left join public.tenants t on t.id = cu.tenant_id
     left join public.degrees d on d.id = cu.degree_id
     left join public.departments dept on dept.id = cu.department_id
     left join public.alumni_profiles ap on ap.college_user_id = cu.id
     where cu.id = $1 and cu.role = 'alumni'`,
    [collegeUserId],
  );
  return result.rows[0] ? mapOwnProfileRow(result.rows[0]) : null;
}

export interface UpsertAlumniProfileParams {
  avatarPath?: string | null;
  bio?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  skills?: string[] | null;
  country?: string | null;
  city?: string | null;
  yearsOfExperience?: number | null;
  workEmail?: string | null;
}

/**
 * Created lazily, via upsert, on the first call -- never eagerly during
 * import commit (Part 4's settled decision). Same coalesce-on-undefined
 * partial-update pattern as upsertStudentProfile: only supplied fields
 * change.
 */
export async function upsertAlumniProfile(
  client: PoolClient,
  tenantId: string,
  collegeUserId: string,
  params: UpsertAlumniProfileParams,
): Promise<void> {
  await client.query(
    `insert into public.alumni_profiles
       (tenant_id, college_user_id, avatar_path, bio, phone, linkedin_url, github_url, company, job_title, skills, country, city, years_of_experience, work_email)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (college_user_id) do update set
       avatar_path = coalesce($3, public.alumni_profiles.avatar_path),
       bio = coalesce($4, public.alumni_profiles.bio),
       phone = coalesce($5, public.alumni_profiles.phone),
       linkedin_url = coalesce($6, public.alumni_profiles.linkedin_url),
       github_url = coalesce($7, public.alumni_profiles.github_url),
       company = coalesce($8, public.alumni_profiles.company),
       job_title = coalesce($9, public.alumni_profiles.job_title),
       skills = coalesce($10, public.alumni_profiles.skills),
       country = coalesce($11, public.alumni_profiles.country),
       city = coalesce($12, public.alumni_profiles.city),
       years_of_experience = coalesce($13, public.alumni_profiles.years_of_experience),
       work_email = coalesce($14, public.alumni_profiles.work_email),
       updated_at = now()`,
    [
      tenantId,
      collegeUserId,
      params.avatarPath ?? null,
      params.bio ?? null,
      params.phone ?? null,
      params.linkedinUrl ?? null,
      params.githubUrl ?? null,
      params.company ?? null,
      params.jobTitle ?? null,
      params.skills ?? null,
      params.country ?? null,
      params.city ?? null,
      params.yearsOfExperience ?? null,
      params.workEmail ?? null,
    ],
  );
}

export interface AlumniEligibility {
  id: string;
  status: CollegeUserStatus;
  isComplete: boolean;
}

/**
 * Backs the two visibility gates that reuse the same rule as the
 * directory (Part 4): an opportunity poster must be active + complete
 * before posting, and a request's target alumnus must be active +
 * complete before it can be sent.
 */
export async function getAlumniEligibility(client: PoolClient, collegeUserId: string): Promise<AlumniEligibility | null> {
  const result = await client.query<{ id: string; status: CollegeUserStatus; is_complete: boolean }>(
    `select cu.id, cu.status, ${ALUMNI_PROFILE_COMPLETE_SQL} as is_complete
     from public.college_users cu
     left join public.alumni_profiles ap on ap.college_user_id = cu.id
     where cu.id = $1 and cu.role = 'alumni'`,
    [collegeUserId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, status: row.status, isComplete: row.is_complete };
}
