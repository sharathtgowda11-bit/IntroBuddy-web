import type { CollegeUserStatus, Role } from "@introbuddy/shared";
import type { PoolClient } from "pg";

export interface CollegeUserRecord {
  id: string;
  tenantId: string;
  userId: string;
  email: string;
  usn: string | null;
  role: Role;
  status: CollegeUserStatus;
}

interface CollegeUserRow {
  id: string;
  tenant_id: string;
  user_id: string;
  email: string;
  usn: string | null;
  role: Role;
  status: CollegeUserStatus;
}

function mapRow(row: CollegeUserRow): CollegeUserRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    email: row.email,
    usn: row.usn,
    role: row.role,
    status: row.status,
  };
}

const SELECT_COLUMNS = "id, tenant_id, user_id, email, usn, role, status";

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

export interface CreateCollegeUserParams {
  tenantId: string;
  userId: string;
  email: string;
  usn?: string | null;
  role: Role;
}

export async function createCollegeUser(client: PoolClient, params: CreateCollegeUserParams): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.college_users (tenant_id, user_id, email, usn, role, status)
     values ($1, $2, $3, $4, $5, 'invited')
     returning id`,
    [params.tenantId, params.userId, params.email, params.usn ?? null, params.role],
  );
  return result.rows[0].id;
}

export async function markCollegeUserActive(client: PoolClient, collegeUserId: string): Promise<void> {
  await client.query(`update public.college_users set status = 'active', updated_at = now() where id = $1`, [
    collegeUserId,
  ]);
}
