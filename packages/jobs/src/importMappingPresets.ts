import type { PoolClient } from "pg";
import type { ImportTargetRole } from "./importJobs.js";

/**
 * (tenant_id, target_role) is the primary key (Phase 2 migration), so RLS
 * plus the target_role filter narrows this to 0 or 1 row -- same reliance
 * as departments.ts's listDepartments had on tenant_id alone pre-Phase-2.
 * Student and alumni imports have different columns to remember, so a
 * single tenant-keyed preset can no longer serve both.
 */
export async function getImportMappingPreset(
  client: PoolClient,
  targetRole: ImportTargetRole = "student",
): Promise<Record<string, string> | null> {
  const result = await client.query<{ column_mapping: Record<string, string> }>(
    `select column_mapping from public.import_mapping_presets where target_role = $1`,
    [targetRole],
  );
  return result.rows[0]?.column_mapping ?? null;
}

export async function upsertImportMappingPreset(
  client: PoolClient,
  tenantId: string,
  columnMapping: Record<string, string>,
  targetRole: ImportTargetRole = "student",
): Promise<void> {
  await client.query(
    `insert into public.import_mapping_presets (tenant_id, target_role, column_mapping) values ($1, $2, $3)
     on conflict (tenant_id, target_role) do update set column_mapping = excluded.column_mapping, updated_at = now()`,
    [tenantId, targetRole, columnMapping],
  );
}
