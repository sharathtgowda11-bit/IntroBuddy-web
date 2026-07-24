import type { CollegeUserStatus, Role } from "@introbuddy/shared";
import type { PoolClient } from "pg";

export interface CollegeUserRecord {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  name: string | null;
  usn: string | null;
  role: Role;
  status: CollegeUserStatus;
  degreeId: string | null;
  departmentId: string | null;
  graduationYear: number | null;
}

interface CollegeUserRow {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string;
  name: string | null;
  usn: string | null;
  role: Role;
  status: CollegeUserStatus;
  degree_id: string | null;
  department_id: string | null;
  graduation_year: number | null;
}

function mapRow(row: CollegeUserRow): CollegeUserRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    usn: row.usn,
    role: row.role,
    status: row.status,
    degreeId: row.degree_id,
    departmentId: row.department_id,
    graduationYear: row.graduation_year,
  };
}

const SELECT_COLUMNS =
  "id, tenant_id, user_id, email, name, usn, role, status, degree_id, department_id, graduation_year";

export async function findCollegeUserByEmail(client: PoolClient, email: string): Promise<CollegeUserRecord | null> {
  const result = await client.query<CollegeUserRow>(
    `select ${SELECT_COLUMNS} from public.college_users where lower(email) = lower($1)`,
    [email],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function findCollegeUserByUsn(client: PoolClient, usn: string): Promise<CollegeUserRecord | null> {
  const result = await client.query<CollegeUserRow>(`select ${SELECT_COLUMNS} from public.college_users where usn = $1`, [
    usn,
  ]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function findCollegeUserById(client: PoolClient, id: string): Promise<CollegeUserRecord | null> {
  const result = await client.query<CollegeUserRow>(`select ${SELECT_COLUMNS} from public.college_users where id = $1`, [
    id,
  ]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/** Most recent not-yet-activated college_admin invitation for the scoped tenant -- used by the reinvite-admin route (spec 8.1's edge case). */
export async function findPendingCollegeAdmin(client: PoolClient): Promise<CollegeUserRecord | null> {
  const result = await client.query<CollegeUserRow>(
    `select ${SELECT_COLUMNS} from public.college_users
     where role = 'college_admin' and status = 'invited'
     order by created_at desc limit 1`,
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export interface CreateCollegeUserParams {
  tenantId: string;
  userId: string;
  email: string;
  name?: string | null;
  usn?: string | null;
  role: Role;
  degreeId?: string | null;
  departmentId?: string | null;
  graduationYear?: number | null;
  sourceImportJobId?: string | null;
}

export async function createCollegeUser(client: PoolClient, params: CreateCollegeUserParams): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.college_users
       (tenant_id, user_id, email, name, usn, role, status, degree_id, department_id, graduation_year, source_import_job_id)
     values ($1, $2, $3, $4, $5, $6, 'invited', $7, $8, $9, $10)
     returning id`,
    [
      params.tenantId,
      params.userId,
      params.email,
      params.name ?? null,
      params.usn ?? null,
      params.role,
      params.degreeId ?? null,
      params.departmentId ?? null,
      params.graduationYear ?? null,
      params.sourceImportJobId ?? null,
    ],
  );
  return result.rows[0].id;
}

/**
 * Bulk-import commit path: existing rows are updated by (tenant, USN),
 * not re-inserted -- the idempotency guarantee that makes a safe re-run
 * possible (spec 8.3: "re-uploading the same file must not create
 * duplicate records"). Deliberately does not touch role/status/email,
 * matching the spec's own scope for what an update-on-reimport means.
 */
export async function updateCollegeUserAcademicFields(
  client: PoolClient,
  collegeUserId: string,
  params: { name?: string | null; degreeId: string; departmentId: string; graduationYear: number },
): Promise<void> {
  await client.query(
    `update public.college_users
     set name = coalesce($2, name), degree_id = $3, department_id = $4, graduation_year = $5, updated_at = now()
     where id = $1`,
    [collegeUserId, params.name ?? null, params.degreeId, params.departmentId, params.graduationYear],
  );
}

export async function markCollegeUserActive(client: PoolClient, collegeUserId: string): Promise<void> {
  await client.query(`update public.college_users set status = 'active', updated_at = now() where id = $1`, [
    collegeUserId,
  ]);
}

/**
 * Reference data for bulk-import validation (packages/import's
 * ValidationContext.existingUsns/existingEmails) -- lowercased and scoped
 * to this tenant by RLS alone, same as every other read in this file.
 */
export async function listExistingStudentIdentifiers(
  client: PoolClient,
): Promise<{ usns: Set<string>; emails: Set<string> }> {
  const result = await client.query<{ usn: string | null; email: string }>(
    `select usn, email from public.college_users where role = 'student'`,
  );
  const usns = new Set<string>();
  const emails = new Set<string>();
  for (const row of result.rows) {
    if (row.usn) usns.add(row.usn.toLowerCase());
    emails.add(row.email.toLowerCase());
  }
  return { usns, emails };
}

/**
 * Live count backing POST /import-jobs/:id/send-invitations' recipient
 * re-confirmation -- students from this import who are still awaiting
 * their invitation (mintInvitationToken hasn't run for them yet).
 */
export async function countPendingInvitationsForImportJob(client: PoolClient, importJobId: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `select count(*) from public.college_users where source_import_job_id = $1 and status = 'invited'`,
    [importJobId],
  );
  return Number(result.rows[0].count);
}

export interface PendingInvitationCandidate {
  collegeUserId: string;
  email: string;
  name: string | null;
  usn: string | null;
  departmentName: string | null;
  graduationYear: number | null;
}

/**
 * The worker's invitationsSend job pulls its next chunk from here. "No
 * open invitation yet" (not just status = 'invited') makes each execution
 * naturally resumable: a candidate who already has a live invitation --
 * because a previous chunk minted one and the email actually sent, see
 * apps/worker's own single-transaction mint+send -- is automatically
 * excluded, with no separate offset/cursor bookkeeping required.
 *
 * usn/departmentName/graduationYear are included so the worker can send
 * the personalized invitation template (spec's Message 2) rather than
 * the generic fallback.
 */
export async function listPendingInvitationCandidates(
  client: PoolClient,
  importJobId: string,
  limit: number,
): Promise<PendingInvitationCandidate[]> {
  const result = await client.query<{
    id: string;
    email: string;
    name: string | null;
    usn: string | null;
    department_name: string | null;
    graduation_year: number | null;
  }>(
    `select cu.id, cu.email, cu.name, cu.usn, cu.graduation_year, dept.name as department_name
     from public.college_users cu
     left join public.departments dept on dept.id = cu.department_id
     where cu.source_import_job_id = $1
       and cu.status = 'invited'
       and not exists (
         select 1 from public.invitations i
         where i.college_user_id = cu.id
           and i.revoked_at is null
           and i.consumed_at is null
           and i.expires_at > now()
       )
     order by cu.created_at
     limit $2`,
    [importJobId, limit],
  );
  return result.rows.map((row) => ({
    collegeUserId: row.id,
    email: row.email,
    name: row.name,
    usn: row.usn,
    departmentName: row.department_name,
    graduationYear: row.graduation_year,
  }));
}
