import type { PoolClient } from "pg";
import { ALUMNI_PROFILE_COMPLETE_SQL } from "./alumniProfiles.js";

/**
 * Deliberately a separate module/query from db/alumni.ts (Part 2, rule
 * 7) -- this is the reduced, public-safe field set students see. Never
 * selects email, phone, or workEmail; never returns a row that isn't
 * active + profile-complete.
 */
export interface AlumniDirectoryListItem {
  id: string;
  name: string | null;
  avatarPath: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  country: string | null;
  linkedinUrl: string | null;
  graduationYear: number | null;
  departmentName: string | null;
  mentorshipAvailable: boolean;
}

interface AlumniDirectoryRow {
  id: string;
  name: string | null;
  avatar_path: string | null;
  company: string | null;
  job_title: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
  graduation_year: number | null;
  department_name: string | null;
  mentorship_available: boolean;
}

function mapRow(row: AlumniDirectoryRow): AlumniDirectoryListItem {
  return {
    id: row.id,
    name: row.name,
    avatarPath: row.avatar_path,
    company: row.company,
    jobTitle: row.job_title,
    city: row.city,
    country: row.country,
    linkedinUrl: row.linkedin_url,
    graduationYear: row.graduation_year,
    departmentName: row.department_name,
    mentorshipAvailable: row.mentorship_available,
  };
}

const SELECT_COLUMNS = `
  cu.id, cu.name, ap.avatar_path, ap.company, ap.job_title, ap.city, ap.country,
  ap.linkedin_url, cu.graduation_year, dept.name as department_name, ap.mentorship_available
`;

const FROM_CLAUSE = `
  from public.college_users cu
  join public.alumni_profiles ap on ap.college_user_id = cu.id
  left join public.departments dept on dept.id = cu.department_id
`;

// Always applied, on every query in this file -- never returns an alumnus
// who hasn't finished onboarding (Part 4's settled decision on directory
// visibility).
const VISIBILITY_CLAUSE = `cu.role = 'alumni' and cu.status = 'active' and ${ALUMNI_PROFILE_COMPLETE_SQL}`;

export interface ListAlumniDirectoryFilters {
  search?: string;
  company?: string;
  departmentId?: string;
  graduationYear?: number;
}

export async function listAlumniDirectory(
  client: PoolClient,
  filters: ListAlumniDirectoryFilters,
): Promise<AlumniDirectoryListItem[]> {
  const conditions = [VISIBILITY_CLAUSE];
  const params: unknown[] = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const idx = params.length;
    conditions.push(`(cu.name ilike $${idx} or ap.company ilike $${idx})`);
  }
  if (filters.company) {
    params.push(`%${filters.company}%`);
    conditions.push(`ap.company ilike $${params.length}`);
  }
  if (filters.departmentId) {
    params.push(filters.departmentId);
    conditions.push(`cu.department_id = $${params.length}`);
  }
  if (filters.graduationYear !== undefined) {
    params.push(filters.graduationYear);
    conditions.push(`cu.graduation_year = $${params.length}`);
  }

  const result = await client.query<AlumniDirectoryRow>(
    `select ${SELECT_COLUMNS} ${FROM_CLAUSE} where ${conditions.join(" and ")} order by cu.name asc nulls last limit 200`,
    params,
  );
  return result.rows.map(mapRow);
}

export interface AlumniDirectoryDetail extends AlumniDirectoryListItem {
  bio: string | null;
  githubUrl: string | null;
}

interface AlumniDirectoryDetailRow extends AlumniDirectoryRow {
  bio: string | null;
  github_url: string | null;
}

export async function findAlumniDirectoryById(client: PoolClient, id: string): Promise<AlumniDirectoryDetail | null> {
  const result = await client.query<AlumniDirectoryDetailRow>(
    `select ${SELECT_COLUMNS}, ap.bio, ap.github_url ${FROM_CLAUSE} where cu.id = $1 and ${VISIBILITY_CLAUSE}`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...mapRow(row), bio: row.bio, githubUrl: row.github_url };
}
