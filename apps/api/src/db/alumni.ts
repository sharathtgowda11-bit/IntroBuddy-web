import type { CollegeUserStatus } from "@introbuddy/shared";
import type { PoolClient } from "pg";
import { ALUMNI_PROFILE_COMPLETE_SQL } from "./alumniProfiles.js";

export interface AlumniListItem {
  id: string;
  name: string | null;
  email: string;
  status: CollegeUserStatus;
  graduationYear: number | null;
  degreeId: string | null;
  degreeName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  company: string | null;
  profileComplete: boolean;
}

interface AlumniListRow {
  id: string;
  name: string | null;
  email: string;
  status: CollegeUserStatus;
  graduation_year: number | null;
  degree_id: string | null;
  degree_name: string | null;
  department_id: string | null;
  department_name: string | null;
  company: string | null;
  profile_complete: boolean;
}

function mapRow(row: AlumniListRow): AlumniListItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    status: row.status,
    graduationYear: row.graduation_year,
    degreeId: row.degree_id,
    degreeName: row.degree_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    company: row.company,
    profileComplete: row.profile_complete,
  };
}

const SELECT_COLUMNS = `
  cu.id, cu.name, cu.email, cu.status, cu.graduation_year,
  cu.degree_id, d.name as degree_name, cu.department_id, dept.name as department_name,
  ap.company, ${ALUMNI_PROFILE_COMPLETE_SQL} as profile_complete
`;

const FROM_CLAUSE = `
  from public.college_users cu
  left join public.degrees d on d.id = cu.degree_id
  left join public.departments dept on dept.id = cu.department_id
  left join public.alumni_profiles ap on ap.college_user_id = cu.id
`;

export interface ListAlumniFilters {
  search?: string;
  company?: string;
  departmentId?: string;
  graduationYear?: number;
  status?: CollegeUserStatus;
  limit: number;
  offset: number;
}

export interface ListAlumniResult {
  alumni: AlumniListItem[];
  total: number;
}

/**
 * Admin-facing list -- every alumni row regardless of status or profile
 * completeness (Part 2, rule 7: this is deliberately a separate router/
 * query from the student-facing directory, which filters to active +
 * complete only). Same ILIKE-over-trigram-index approach as listStudents.
 */
export async function listAlumni(client: PoolClient, filters: ListAlumniFilters): Promise<ListAlumniResult> {
  const conditions: string[] = ["cu.role = 'alumni'"];
  const params: unknown[] = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const idx = params.length;
    conditions.push(`(cu.name ilike $${idx} or cu.email ilike $${idx})`);
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
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`cu.status = $${params.length}`);
  }

  const whereClause = conditions.join(" and ");

  const countResult = await client.query<{ count: string }>(`select count(*) ${FROM_CLAUSE} where ${whereClause}`, params);

  const listParams = [...params, filters.limit, filters.offset];
  const limitIdx = listParams.length - 1;
  const offsetIdx = listParams.length;

  const listResult = await client.query<AlumniListRow>(
    `select ${SELECT_COLUMNS} ${FROM_CLAUSE} where ${whereClause} order by cu.created_at desc limit $${limitIdx} offset $${offsetIdx}`,
    listParams,
  );

  return { alumni: listResult.rows.map(mapRow), total: Number(countResult.rows[0].count) };
}

export async function findAlumniById(client: PoolClient, id: string): Promise<AlumniListItem | null> {
  const result = await client.query<AlumniListRow>(
    `select ${SELECT_COLUMNS} ${FROM_CLAUSE} where cu.id = $1 and cu.role = 'alumni'`,
    [id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export interface UpdateAlumniManagedFieldsParams {
  name?: string;
  degreeId?: string;
  departmentId?: string;
  graduationYear?: number;
}

/** College-managed fields only -- never touches alumni_profiles, which is self-managed by the alumnus. */
export async function updateAlumniManagedFields(
  client: PoolClient,
  id: string,
  params: UpdateAlumniManagedFieldsParams,
): Promise<void> {
  await client.query(
    `update public.college_users set
       name = coalesce($2, name),
       degree_id = coalesce($3, degree_id),
       department_id = coalesce($4, department_id),
       graduation_year = coalesce($5, graduation_year),
       updated_at = now()
     where id = $1`,
    [id, params.name ?? null, params.degreeId ?? null, params.departmentId ?? null, params.graduationYear ?? null],
  );
}

export async function setAlumniStatus(client: PoolClient, id: string, status: CollegeUserStatus): Promise<void> {
  await client.query(`update public.college_users set status = $2, updated_at = now() where id = $1`, [id, status]);
}

export interface AlumniDashboardStats {
  totalAlumni: number;
  activeAlumniCount: number;
  invitedAlumniCount: number;
  deactivatedAlumniCount: number;
  alumniProfileCompleteCount: number;
  alumniByCompany: { company: string; count: number }[];
}

/** Direct query under withTenant(), same as getDashboardStats -- not the SECURITY DEFINER function, which is reserved for the cross-tenant platform view. */
export async function getAlumniDashboardStats(client: PoolClient): Promise<AlumniDashboardStats> {
  const statsResult = await client.query<{
    total: string;
    active: string;
    invited: string;
    deactivated: string;
    profile_complete: string;
  }>(
    `select
       count(*) filter (where cu.role = 'alumni') as total,
       count(*) filter (where cu.role = 'alumni' and cu.status = 'active') as active,
       count(*) filter (where cu.role = 'alumni' and cu.status = 'invited') as invited,
       count(*) filter (where cu.role = 'alumni' and cu.status = 'deactivated') as deactivated,
       count(*) filter (where cu.role = 'alumni' and ${ALUMNI_PROFILE_COMPLETE_SQL}) as profile_complete
     from public.college_users cu
     left join public.alumni_profiles ap on ap.college_user_id = cu.id`,
  );
  const row = statsResult.rows[0];

  // Raw text grouping for now -- a normalized company entity can layer on
  // top of alumni_profiles.company later without a schema change (Part 15
  // open item), not a blocker for this phase.
  const companyResult = await client.query<{ company: string; count: string }>(
    `select ap.company, count(*) as count
     from public.college_users cu
     join public.alumni_profiles ap on ap.college_user_id = cu.id
     where cu.role = 'alumni' and ap.company is not null and ap.company != ''
     group by ap.company
     order by count desc, ap.company asc
     limit 20`,
  );

  return {
    totalAlumni: Number(row.total),
    activeAlumniCount: Number(row.active),
    invitedAlumniCount: Number(row.invited),
    deactivatedAlumniCount: Number(row.deactivated),
    alumniProfileCompleteCount: Number(row.profile_complete),
    alumniByCompany: companyResult.rows.map((r) => ({ company: r.company, count: Number(r.count) })),
  };
}
