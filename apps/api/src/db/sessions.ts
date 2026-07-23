import type { PoolClient } from "pg";
import type { Role } from "@introbuddy/shared";

export interface SessionRecord {
  id: string;
  tenantId: string;
  collegeUserId: string;
  role: Role;
  expiresAt: Date;
  revokedAt: Date | null;
}

export async function findSessionByTokenHash(client: PoolClient, tokenHash: string): Promise<SessionRecord | null> {
  const result = await client.query<{
    id: string;
    tenant_id: string;
    college_user_id: string;
    role: Role;
    expires_at: Date;
    revoked_at: Date | null;
  }>(
    `select s.id, s.tenant_id, s.college_user_id, s.expires_at, s.revoked_at, cu.role
     from public.sessions s
     join public.college_users cu on cu.id = s.college_user_id
     where s.token_hash = $1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    collegeUserId: row.college_user_id,
    role: row.role,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export interface CreateSessionParams {
  tenantId: string;
  collegeUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export async function createSession(client: PoolClient, params: CreateSessionParams): Promise<string> {
  const result = await client.query<{ id: string }>(
    `insert into public.sessions (tenant_id, college_user_id, token_hash, expires_at)
     values ($1, $2, $3, $4)
     returning id`,
    [params.tenantId, params.collegeUserId, params.tokenHash, params.expiresAt],
  );
  return result.rows[0].id;
}

export async function touchSessionLastUsed(client: PoolClient, sessionId: string): Promise<void> {
  await client.query(`update public.sessions set last_used_at = now() where id = $1`, [sessionId]);
}

/** Spec 8.6: completing a password reset invalidates existing sessions for that user. */
export async function revokeAllSessionsForCollegeUser(client: PoolClient, collegeUserId: string): Promise<void> {
  await client.query(`update public.sessions set revoked_at = now() where college_user_id = $1 and revoked_at is null`, [
    collegeUserId,
  ]);
}
