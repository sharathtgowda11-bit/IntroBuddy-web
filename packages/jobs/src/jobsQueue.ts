import type { Pool, PoolClient } from "pg";

export type JobType = "import.commit" | "invitations.send";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobRecord {
  id: string;
  tenantId: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lastError: string | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

interface JobRow {
  id: string | null;
  tenant_id: string | null;
  type: JobType | null;
  payload: Record<string, unknown> | null;
  status: JobStatus | null;
  attempts: number | null;
  max_attempts: number | null;
  run_after: Date | null;
  last_error: string | null;
  idempotency_key: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

function mapRow(row: JobRow): JobRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    type: row.type as JobType,
    payload: row.payload as Record<string, unknown>,
    status: row.status as JobStatus,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    runAfter: row.run_after as Date,
    lastError: row.last_error,
    idempotencyKey: row.idempotency_key as string,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

const SELECT_COLUMNS =
  "id, tenant_id, type, payload, status, attempts, max_attempts, run_after, last_error, idempotency_key, created_at, updated_at";

export interface EnqueueJobParams {
  tenantId: string;
  type: JobType;
  payload?: Record<string, unknown>;
  /** import_jobs.id (or another naturally-stable id) -- what makes calling the enqueueing route twice a safe no-op. */
  idempotencyKey: string;
  runAfter?: Date;
}

/**
 * Idempotent by (tenant_id, type, idempotency_key) -- the DB's own unique
 * constraint. ON CONFLICT DO UPDATE with a no-op assignment (rather than
 * DO NOTHING) so RETURNING always yields a row, whether this call created
 * it or a previous one did.
 */
export async function enqueueJob(client: PoolClient, params: EnqueueJobParams): Promise<JobRecord> {
  const result = await client.query<JobRow>(
    `insert into public.jobs (tenant_id, type, payload, idempotency_key, run_after)
     values ($1, $2, $3, $4, coalesce($5, now()))
     on conflict (tenant_id, type, idempotency_key) do update set updated_at = public.jobs.updated_at
     returning ${SELECT_COLUMNS}`,
    [params.tenantId, params.type, params.payload ?? {}, params.idempotencyKey, params.runAfter ?? null],
  );
  return mapRow(result.rows[0]);
}

/**
 * Wraps claim_next_job(), the one SECURITY DEFINER function that
 * deliberately bypasses RLS to poll across every tenant at once (see the
 * student_import migration). Called with a plain pool, never withTenant --
 * there is no single tenant to scope this query to before a job is
 * claimed. The function always returns exactly one row; a null `id`
 * column (not zero rows) means nothing was available to claim.
 */
export async function claimNextJob(pool: Pool, jobTypes: JobType[]): Promise<JobRecord | null> {
  const result = await pool.query<JobRow>(`select * from public.claim_next_job($1)`, [jobTypes]);
  const row = result.rows[0];
  if (!row || row.id === null) {
    return null;
  }
  return mapRow(row);
}

export interface CompleteJobParams {
  status: "succeeded" | "failed";
  lastError?: string | null;
}

export async function completeJob(client: PoolClient, jobId: string, params: CompleteJobParams): Promise<void> {
  await client.query(`update public.jobs set status = $2, last_error = $3, updated_at = now() where id = $1`, [
    jobId,
    params.status,
    params.lastError ?? null,
  ]);
}

/** Reschedules a job that has more work to do -- stays queued, never sleeps in-process. */
export async function rescheduleJob(client: PoolClient, jobId: string, runAfter: Date, payload?: Record<string, unknown>): Promise<void> {
  await client.query(
    `update public.jobs set status = 'queued', run_after = $2, payload = coalesce($3, payload), updated_at = now() where id = $1`,
    [jobId, runAfter, payload ?? null],
  );
}
