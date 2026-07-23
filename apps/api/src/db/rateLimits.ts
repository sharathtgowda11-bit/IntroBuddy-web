import type { Pool } from "pg";

/**
 * rate_limit_hits carries no tenant_id and no RLS -- pure operational
 * bookkeeping, so this runs against the plain pool. A Postgres table
 * rather than an in-process counter, because the latter silently stops
 * working correctly the moment the API runs as more than one replica.
 */
export async function recordHit(pool: Pool, bucket: string, windowSeconds: number): Promise<number> {
  const windowStartMs = Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000;
  const result = await pool.query<{ hit_count: number }>(
    `insert into public.rate_limit_hits (bucket, window_start, hit_count)
     values ($1, $2, 1)
     on conflict (bucket, window_start)
     do update set hit_count = rate_limit_hits.hit_count + 1
     returning hit_count`,
    [bucket, new Date(windowStartMs)],
  );
  return result.rows[0].hit_count;
}
