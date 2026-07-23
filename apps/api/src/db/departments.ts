import type { PoolClient } from "pg";

export interface DepartmentRecord {
  id: string;
  tenantId: string;
  degreeId: string;
  name: string;
}

interface DepartmentRow {
  id: string;
  tenant_id: string;
  degree_id: string;
  name: string;
}

function mapRow(row: DepartmentRow): DepartmentRecord {
  return { id: row.id, tenantId: row.tenant_id, degreeId: row.degree_id, name: row.name };
}

export async function listDepartments(client: PoolClient): Promise<DepartmentRecord[]> {
  const result = await client.query<DepartmentRow>(
    `select id, tenant_id, degree_id, name from public.departments order by name`,
  );
  return result.rows.map(mapRow);
}

/**
 * The single lookup that resolves degree_id from department_id -- used
 * by both single-student add (this file's caller) and bulk import's
 * validation module, so degree_id is always derived server-side, never
 * accepted as separate client input (see the student_import migration's
 * comment on college_users.degree_id/department_id).
 */
export async function findDepartmentById(client: PoolClient, id: string): Promise<DepartmentRecord | null> {
  const result = await client.query<DepartmentRow>(
    `select id, tenant_id, degree_id, name from public.departments where id = $1`,
    [id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function createDepartment(
  client: PoolClient,
  tenantId: string,
  degreeId: string,
  name: string,
): Promise<DepartmentRecord> {
  const result = await client.query<DepartmentRow>(
    `insert into public.departments (tenant_id, degree_id, name) values ($1, $2, $3)
     returning id, tenant_id, degree_id, name`,
    [tenantId, degreeId, name],
  );
  return mapRow(result.rows[0]);
}

export async function renameDepartment(client: PoolClient, id: string, name: string): Promise<void> {
  await client.query(`update public.departments set name = $2, updated_at = now() where id = $1`, [id, name]);
}

/**
 * Not expected to throw an FK violation today -- college_users has no
 * degree_id/department_id column yet, so nothing can reference a
 * department (spec 8.2's student-attachment guard lands with Milestone
 * 4/5). Kept symmetric with deleteDegree regardless.
 */
export async function deleteDepartment(client: PoolClient, id: string): Promise<void> {
  await client.query(`delete from public.departments where id = $1`, [id]);
}
