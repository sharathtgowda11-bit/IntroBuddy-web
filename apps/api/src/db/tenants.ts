import type { Pool } from "pg";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
}

/**
 * tenants is not tenant-scoped (it IS the tenant), so it carries no RLS
 * policy and this can run against the plain pool -- no withTenant needed.
 * This is the very first lookup in login/reset flows, resolving the
 * client-supplied tenantSlug into a real tenant id before anything else
 * can happen; the slug is a routing hint only, same as the compound
 * token's tenant prefix, never trusted for authorization by itself.
 */
export async function findTenantBySlug(pool: Pool, slug: string): Promise<TenantRecord | null> {
  const result = await pool.query<TenantRecord>(`select id, slug, name from public.tenants where slug = $1`, [slug]);
  return result.rows[0] ?? null;
}
