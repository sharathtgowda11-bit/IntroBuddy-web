import type { PoolClient } from "pg";

export interface DegreeRecord {
  id: string;
  tenantId: string;
  name: string;
}

interface DegreeRow {
  id: string;
  tenant_id: string;
  name: string;
}

function mapRow(row: DegreeRow): DegreeRecord {
  return { id: row.id, tenantId: row.tenant_id, name: row.name };
}

// No explicit tenant_id filter -- RLS already scopes every query to the
// transaction's tenant, matching the established pattern (e.g.
// collegeUsers.ts's lookups carry no tenant_id filter either).
export async function listDegrees(client: PoolClient): Promise<DegreeRecord[]> {
  const result = await client.query<DegreeRow>(`select id, tenant_id, name from public.degrees order by name`);
  return result.rows.map(mapRow);
}

export async function createDegree(client: PoolClient, tenantId: string, name: string): Promise<DegreeRecord> {
  const result = await client.query<DegreeRow>(
    `insert into public.degrees (tenant_id, name) values ($1, $2) returning id, tenant_id, name`,
    [tenantId, name],
  );
  return mapRow(result.rows[0]);
}

export async function renameDegree(client: PoolClient, id: string, name: string): Promise<void> {
  await client.query(`update public.degrees set name = $2, updated_at = now() where id = $1`, [id, name]);
}

/** Throws Postgres error 23503 (foreign_key_violation) if departments are still attached -- the route translates this to 409. */
export async function deleteDegree(client: PoolClient, id: string): Promise<void> {
  await client.query(`delete from public.degrees where id = $1`, [id]);
}
