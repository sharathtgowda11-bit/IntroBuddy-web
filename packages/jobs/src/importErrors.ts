import type { PoolClient } from "pg";

export interface ImportErrorRecord {
  rowNumber: number;
  rawRow: Record<string, string>;
  errorReason: string;
}

/**
 * Delete-then-insert, never update -- import_errors' own grant has no
 * update privilege (see the migration's comment), matching audit_log's
 * immutable-record spirit. Called fresh on every validate/commit pass so
 * this table always reflects the latest attempt, never a stale mix of two.
 */
export async function replaceImportErrors(
  client: PoolClient,
  tenantId: string,
  importJobId: string,
  errors: ImportErrorRecord[],
): Promise<void> {
  await client.query(`delete from public.import_errors where import_job_id = $1`, [importJobId]);
  if (errors.length === 0) {
    return;
  }
  const values: string[] = [];
  const params: unknown[] = [];
  errors.forEach((error, index) => {
    const base = index * 5;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    params.push(tenantId, importJobId, error.rowNumber, error.rawRow, error.errorReason);
  });
  await client.query(
    `insert into public.import_errors (tenant_id, import_job_id, row_number, raw_row, error_reason) values ${values.join(", ")}`,
    params,
  );
}

export async function listImportErrors(client: PoolClient, importJobId: string): Promise<ImportErrorRecord[]> {
  const result = await client.query<{ row_number: number; raw_row: Record<string, string>; error_reason: string }>(
    `select row_number, raw_row, error_reason from public.import_errors where import_job_id = $1 order by row_number`,
    [importJobId],
  );
  return result.rows.map((row) => ({ rowNumber: row.row_number, rawRow: row.raw_row, errorReason: row.error_reason }));
}
