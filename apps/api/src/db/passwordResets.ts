import type { PoolClient } from "pg";

export interface PasswordResetRecord {
  id: string;
  tenantId: string;
  collegeUserId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}

interface PasswordResetRow {
  id: string;
  tenant_id: string;
  college_user_id: string;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
}

function mapRow(row: PasswordResetRow): PasswordResetRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    collegeUserId: row.college_user_id,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
  };
}

export interface CreatePasswordResetParams {
  tenantId: string;
  collegeUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function createPasswordReset(client: PoolClient, params: CreatePasswordResetParams): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.password_resets (tenant_id, college_user_id, token_hash, expires_at)
     values ($1, $2, $3, $4)
     returning id`,
    [params.tenantId, params.collegeUserId, params.tokenHash, params.expiresAt],
  );
  return result.rows[0].id;
}

export async function revokeOpenPasswordResetsForCollegeUser(client: PoolClient, collegeUserId: string): Promise<void> {
  await client.query(
    `update public.password_resets set revoked_at = now(), updated_at = now()
     where college_user_id = $1 and consumed_at is null and revoked_at is null`,
    [collegeUserId],
  );
}

export async function findActivePasswordResetByTokenHash(
  client: PoolClient,
  tokenHash: string,
): Promise<PasswordResetRecord | null> {
  const result = await client.query<PasswordResetRow>(
    `select id, tenant_id, college_user_id, expires_at, consumed_at, revoked_at
     from public.password_resets
     where token_hash = $1 and consumed_at is null and revoked_at is null and expires_at > now()`,
    [tokenHash],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function consumePasswordReset(client: PoolClient, id: string): Promise<void> {
  await client.query(`update public.password_resets set consumed_at = now(), updated_at = now() where id = $1`, [id]);
}
