import type { PoolClient } from "pg";

/** tenant_id is the primary key, so RLS alone narrows this to 0 or 1 row -- same reliance as departments.ts's listDepartments. */
export async function getImportMappingPreset(client: PoolClient): Promise<Record<string, string> | null> {
  const result = await client.query<{ column_mapping: Record<string, string> }>(
    `select column_mapping from public.import_mapping_presets`,
  );
  return result.rows[0]?.column_mapping ?? null;
}

export async function upsertImportMappingPreset(
  client: PoolClient,
  tenantId: string,
  columnMapping: Record<string, string>,
): Promise<void> {
  await client.query(
    `insert into public.import_mapping_presets (tenant_id, column_mapping) values ($1, $2)
     on conflict (tenant_id) do update set column_mapping = excluded.column_mapping, updated_at = now()`,
    [tenantId, columnMapping],
  );
}
