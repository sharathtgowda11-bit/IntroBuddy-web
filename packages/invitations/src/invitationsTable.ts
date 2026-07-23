import type { PoolClient } from "pg";

export interface InvitationRecord {
  id: string;
  tenantId: string;
  collegeUserId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}

interface InvitationRow {
  id: string;
  tenant_id: string;
  college_user_id: string;
  expires_at: Date;
  consumed_at: Date | null;
  revoked_at: Date | null;
}

function mapRow(row: InvitationRow): InvitationRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    collegeUserId: row.college_user_id,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    revokedAt: row.revoked_at,
  };
}

export interface CreateInvitationParams {
  tenantId: string;
  collegeUserId: string;
  tokenHash: string;
  // null only for the system bootstrap (apps/api/src/scripts/bootstrapSuperAdmin.ts),
  // which has no human inviter -- every ordinary invitation still supplies one.
  invitedBy: string | null;
  expiresAt: Date;
}

export async function createInvitation(client: PoolClient, params: CreateInvitationParams): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.invitations (tenant_id, college_user_id, token_hash, invited_by, expires_at)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [params.tenantId, params.collegeUserId, params.tokenHash, params.invitedBy, params.expiresAt],
  );
  return result.rows[0].id;
}

/** Reissuing a token must invalidate every previous one for that person (spec 10.5). */
export async function revokeOpenInvitationsForCollegeUser(client: PoolClient, collegeUserId: string): Promise<void> {
  await client.query(
    `update public.invitations set revoked_at = now(), updated_at = now()
     where college_user_id = $1 and consumed_at is null and revoked_at is null`,
    [collegeUserId],
  );
}

export async function findActiveInvitationByTokenHash(
  client: PoolClient,
  tokenHash: string,
): Promise<InvitationRecord | null> {
  const result = await client.query<InvitationRow>(
    `select id, tenant_id, college_user_id, expires_at, consumed_at, revoked_at
     from public.invitations
     where token_hash = $1 and consumed_at is null and revoked_at is null and expires_at > now()`,
    [tokenHash],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function consumeInvitation(client: PoolClient, invitationId: string): Promise<void> {
  await client.query(`update public.invitations set consumed_at = now(), updated_at = now() where id = $1`, [
    invitationId,
  ]);
}
