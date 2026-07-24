import type { PoolClient } from "pg";

export interface OwnProfileRecord {
  collegeUserId: string;
  name: string | null;
  usn: string | null;
  email: string;
  graduationYear: number | null;
  degreeName: string | null;
  departmentName: string | null;
  avatarPath: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  resumePath: string | null;
  bio: string | null;
  skills: string | null;
  interests: string | null;
  achievements: string | null;
}

interface OwnProfileRow {
  college_user_id: string;
  name: string | null;
  usn: string | null;
  email: string;
  graduation_year: number | null;
  degree_name: string | null;
  department_name: string | null;
  avatar_path: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  resume_path: string | null;
  bio: string | null;
  skills: string | null;
  interests: string | null;
  achievements: string | null;
}

function mapRow(row: OwnProfileRow): OwnProfileRecord {
  return {
    collegeUserId: row.college_user_id,
    name: row.name,
    usn: row.usn,
    email: row.email,
    graduationYear: row.graduation_year,
    degreeName: row.degree_name,
    departmentName: row.department_name,
    avatarPath: row.avatar_path,
    linkedinUrl: row.linkedin_url,
    githubUrl: row.github_url,
    resumePath: row.resume_path,
    bio: row.bio,
    skills: row.skills,
    interests: row.interests,
    achievements: row.achievements,
  };
}

/**
 * One combined read for GET /me/profile -- college-managed fields (name,
 * usn, degree, department, graduation year, email) come straight from
 * college_users and are never writable through this route; self-authored
 * fields come from the one-to-one student_profiles row, which may not
 * exist yet (hence the left join).
 */
export async function getOwnProfile(client: PoolClient, collegeUserId: string): Promise<OwnProfileRecord | null> {
  const result = await client.query<OwnProfileRow>(
    `select
       cu.id as college_user_id, cu.name, cu.usn, cu.email, cu.graduation_year,
       d.name as degree_name, dept.name as department_name,
       sp.avatar_path, sp.linkedin_url, sp.github_url, sp.resume_path,
       sp.bio, sp.skills, sp.interests, sp.achievements
     from public.college_users cu
     left join public.degrees d on d.id = cu.degree_id
     left join public.departments dept on dept.id = cu.department_id
     left join public.student_profiles sp on sp.college_user_id = cu.id
     where cu.id = $1`,
    [collegeUserId],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export interface UpsertStudentProfileParams {
  avatarPath?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  resumePath?: string | null;
  bio?: string | null;
  skills?: string | null;
  interests?: string | null;
  achievements?: string | null;
}

/** Partial update, same coalesce-on-undefined pattern as tenants.ts's updateTenantProfile -- only supplied fields change. */
export async function upsertStudentProfile(
  client: PoolClient,
  tenantId: string,
  collegeUserId: string,
  params: UpsertStudentProfileParams,
): Promise<void> {
  await client.query(
    `insert into public.student_profiles
       (tenant_id, college_user_id, avatar_path, linkedin_url, github_url, resume_path, bio, skills, interests, achievements)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (college_user_id) do update set
       avatar_path = coalesce($3, public.student_profiles.avatar_path),
       linkedin_url = coalesce($4, public.student_profiles.linkedin_url),
       github_url = coalesce($5, public.student_profiles.github_url),
       resume_path = coalesce($6, public.student_profiles.resume_path),
       bio = coalesce($7, public.student_profiles.bio),
       skills = coalesce($8, public.student_profiles.skills),
       interests = coalesce($9, public.student_profiles.interests),
       achievements = coalesce($10, public.student_profiles.achievements),
       updated_at = now()`,
    [
      tenantId,
      collegeUserId,
      params.avatarPath ?? null,
      params.linkedinUrl ?? null,
      params.githubUrl ?? null,
      params.resumePath ?? null,
      params.bio ?? null,
      params.skills ?? null,
      params.interests ?? null,
      params.achievements ?? null,
    ],
  );
}
