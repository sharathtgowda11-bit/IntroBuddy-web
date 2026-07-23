import type { TenantStatus } from "@introbuddy/shared";
import type { Pool, PoolClient } from "pg";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  city: string | null;
  status: TenantStatus;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  logoPath: string | null;
  bannerPath: string | null;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  city: string | null;
  status: TenantStatus;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  logo_path: string | null;
  banner_path: string | null;
}

function mapRow(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    state: row.state,
    city: row.city,
    status: row.status,
    description: row.description,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    logoPath: row.logo_path,
    bannerPath: row.banner_path,
  };
}

const SELECT_COLUMNS =
  "id, slug, name, state, city, status, description, contact_email, contact_phone, logo_path, banner_path";

/**
 * tenants is not tenant-scoped (it IS the tenant), so it carries no RLS
 * policy and this can run against the plain pool -- no withTenant needed.
 * This is the very first lookup in login/reset flows, resolving the
 * client-supplied tenantSlug into a real tenant id before anything else
 * can happen; the slug is a routing hint only, same as the compound
 * token's tenant prefix, never trusted for authorization by itself.
 */
export async function findTenantBySlug(pool: Pool, slug: string): Promise<TenantRecord | null> {
  const result = await pool.query<TenantRow>(`select ${SELECT_COLUMNS} from public.tenants where slug = $1`, [slug]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function findTenantById(clientOrPool: Pool | PoolClient, tenantId: string): Promise<TenantRecord | null> {
  const result = await clientOrPool.query<TenantRow>(`select ${SELECT_COLUMNS} from public.tenants where id = $1`, [
    tenantId,
  ]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Idempotently ensures the sentinel platform tenant exists -- the anchor
 * every super_admin's college_users row belongs to, since super_admin is
 * platform-wide but every college_users row still needs a real tenant_id
 * (see ADR 0007). Runs on the plain pool: tenants carries no RLS.
 */
export async function findOrCreatePlatformTenant(pool: Pool): Promise<TenantRecord> {
  const existing = await findTenantBySlug(pool, "platform");
  if (existing) return existing;

  await pool.query(
    `insert into public.tenants (name, slug, status) values ('IntroBuddy Platform', 'platform', 'active')
     on conflict (slug) do nothing`,
  );
  const created = await findTenantBySlug(pool, "platform");
  if (!created) {
    throw new Error("failed to create or find the platform tenant");
  }
  return created;
}

export interface CreateTenantParams {
  id: string;
  name: string;
  slug: string;
  state: string;
  city: string;
}

/**
 * Runs inside the same withTenant(pool, id, ...) transaction as
 * everything else provisioned for this new tenant -- tenants itself has
 * no RLS, so this insert succeeds regardless of the app.tenant_id
 * setting active on the connection.
 */
export async function createTenant(client: PoolClient, params: CreateTenantParams): Promise<void> {
  await client.query(
    `insert into public.tenants (id, name, slug, state, city, status) values ($1, $2, $3, $4, $5, 'provisioning')`,
    [params.id, params.name, params.slug, params.state, params.city],
  );
}

export interface UpdateTenantProfileParams {
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoPath?: string;
  bannerPath?: string;
}

/**
 * Partial update -- only supplied fields change. If, after this update,
 * both logo_path and banner_path are set and status is still
 * 'provisioning', flips to 'active' in the same statement (confirmed
 * decision: automatic transition, no separate "finish setup" endpoint).
 */
export async function updateTenantProfile(
  client: PoolClient,
  tenantId: string,
  params: UpdateTenantProfileParams,
): Promise<void> {
  await client.query(
    `update public.tenants set
       description = coalesce($2, description),
       contact_email = coalesce($3, contact_email),
       contact_phone = coalesce($4, contact_phone),
       logo_path = coalesce($5, logo_path),
       banner_path = coalesce($6, banner_path),
       status = case
         when status = 'provisioning'
              and coalesce($5, logo_path) is not null
              and coalesce($6, banner_path) is not null
           then 'active'
         else status
       end,
       updated_at = now()
     where id = $1`,
    [
      tenantId,
      params.description ?? null,
      params.contactEmail ?? null,
      params.contactPhone ?? null,
      params.logoPath ?? null,
      params.bannerPath ?? null,
    ],
  );
}
