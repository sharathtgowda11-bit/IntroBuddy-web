import type { CollegeUserStatus } from "@introbuddy/shared";
import type { PoolClient } from "pg";

export interface StudentListItem {
  id: string;
  name: string | null;
  usn: string | null;
  email: string;
  status: CollegeUserStatus;
  graduationYear: number | null;
  degreeId: string | null;
  degreeName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  profileComplete: boolean;
}

interface StudentListRow {
  id: string;
  name: string | null;
  usn: string | null;
  email: string;
  status: CollegeUserStatus;
  graduation_year: number | null;
  degree_id: string | null;
  degree_name: string | null;
  department_id: string | null;
  department_name: string | null;
  profile_complete: boolean;
}

function mapRow(row: StudentListRow): StudentListItem {
  return {
    id: row.id,
    name: row.name,
    usn: row.usn,
    email: row.email,
    status: row.status,
    graduationYear: row.graduation_year,
    degreeId: row.degree_id,
    degreeName: row.degree_name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    profileComplete: row.profile_complete,
  };
}

const SELECT_COLUMNS = `
  cu.id, cu.name, cu.usn, cu.email, cu.status, cu.graduation_year,
  cu.degree_id, d.name as degree_name, cu.department_id, dept.name as department_name,
  (sp.avatar_path is not null and sp.linkedin_url is not null) as profile_complete
`;

const FROM_CLAUSE = `
  from public.college_users cu
  left join public.degrees d on d.id = cu.degree_id
  left join public.departments dept on dept.id = cu.department_id
  left join public.student_profiles sp on sp.college_user_id = cu.id
`;

export interface ListStudentsFilters {
  search?: string;
  departmentId?: string;
  degreeId?: string;
  status?: CollegeUserStatus;
  limit: number;
  offset: number;
}

export interface ListStudentsResult {
  students: StudentListItem[];
  total: number;
}

/** Search backed by the trigram GIN indexes (student_administration migration) -- ILIKE across name/email/usn is spec's own stated choice (pg_trgm over Elasticsearch) at this data volume. */
export async function listStudents(client: PoolClient, filters: ListStudentsFilters): Promise<ListStudentsResult> {
  const conditions: string[] = ["cu.role = 'student'"];
  const params: unknown[] = [];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const idx = params.length;
    conditions.push(`(cu.name ilike $${idx} or cu.email ilike $${idx} or cu.usn ilike $${idx})`);
  }
  if (filters.departmentId) {
    params.push(filters.departmentId);
    conditions.push(`cu.department_id = $${params.length}`);
  }
  if (filters.degreeId) {
    params.push(filters.degreeId);
    conditions.push(`cu.degree_id = $${params.length}`);
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

  const listResult = await client.query<StudentListRow>(
    `select ${SELECT_COLUMNS} ${FROM_CLAUSE} where ${whereClause} order by cu.created_at desc limit $${limitIdx} offset $${offsetIdx}`,
    listParams,
  );

  return { students: listResult.rows.map(mapRow), total: Number(countResult.rows[0].count) };
}

export async function findStudentById(client: PoolClient, id: string): Promise<StudentListItem | null> {
  const result = await client.query<StudentListRow>(
    `select ${SELECT_COLUMNS} ${FROM_CLAUSE} where cu.id = $1 and cu.role = 'student'`,
    [id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export interface UpdateStudentManagedFieldsParams {
  name?: string;
  usn?: string;
  degreeId?: string;
  departmentId?: string;
  graduationYear?: number;
}

/** degreeId is always derived server-side from departmentId by the route, never accepted independently -- same principle as invitations.ts's single-add fix. */
export async function updateStudentManagedFields(
  client: PoolClient,
  id: string,
  params: UpdateStudentManagedFieldsParams,
): Promise<void> {
  await client.query(
    `update public.college_users set
       name = coalesce($2, name),
       usn = coalesce($3, usn),
       degree_id = coalesce($4, degree_id),
       department_id = coalesce($5, department_id),
       graduation_year = coalesce($6, graduation_year),
       updated_at = now()
     where id = $1`,
    [
      id,
      params.name ?? null,
      params.usn ?? null,
      params.degreeId ?? null,
      params.departmentId ?? null,
      params.graduationYear ?? null,
    ],
  );
}

export async function setStudentStatus(client: PoolClient, id: string, status: CollegeUserStatus): Promise<void> {
  await client.query(`update public.college_users set status = $2, updated_at = now() where id = $1`, [id, status]);
}

export interface DashboardStats {
  totalStudents: number;
  activeCount: number;
  invitedCount: number;
  deactivatedCount: number;
  profileCompleteCount: number;
}

export async function getDashboardStats(client: PoolClient): Promise<DashboardStats> {
  const result = await client.query<{
    total: string;
    active: string;
    invited: string;
    deactivated: string;
    profile_complete: string;
  }>(
    `select
       count(*) filter (where cu.role = 'student') as total,
       count(*) filter (where cu.role = 'student' and cu.status = 'active') as active,
       count(*) filter (where cu.role = 'student' and cu.status = 'invited') as invited,
       count(*) filter (where cu.role = 'student' and cu.status = 'deactivated') as deactivated,
       count(*) filter (
         where cu.role = 'student' and sp.avatar_path is not null and sp.linkedin_url is not null
       ) as profile_complete
     from public.college_users cu
     left join public.student_profiles sp on sp.college_user_id = cu.id`,
  );
  const row = result.rows[0];
  return {
    totalStudents: Number(row.total),
    activeCount: Number(row.active),
    invitedCount: Number(row.invited),
    deactivatedCount: Number(row.deactivated),
    profileCompleteCount: Number(row.profile_complete),
  };
}
