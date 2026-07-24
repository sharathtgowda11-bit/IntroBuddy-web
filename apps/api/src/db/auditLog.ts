import type { PoolClient } from "pg";

export interface WriteAuditLogParams {
  tenantId: string;
  actorCollegeUserId: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
}

/**
 * Written inside the same transaction as the action it records, never
 * best-effort afterward -- a missing audit entry for an administrative
 * action is a compliance gap with no acceptable fallback. Contrast with
 * ADR 0006's fail-open breached-password check; see ADR 0008.
 */
export async function writeAuditLog(client: PoolClient, params: WriteAuditLogParams): Promise<void> {
  await client.query(
    `insert into public.audit_log (tenant_id, actor_college_user_id, action, target_type, target_id, ip_address)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      params.tenantId,
      params.actorCollegeUserId,
      params.action,
      params.targetType,
      params.targetId ?? null,
      params.ipAddress ?? null,
    ],
  );
}

export interface AuditLogEntry {
  id: string;
  actorCollegeUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  createdAt: Date;
}

export interface ListAuditLogParams {
  limit: number;
  offset: number;
}

export interface ListAuditLogResult {
  entries: AuditLogEntry[];
  total: number;
}

/** The read side -- writeAuditLog above stayed write-only until Milestone 6's "audit log viewer". */
export async function listAuditLog(client: PoolClient, params: ListAuditLogParams): Promise<ListAuditLogResult> {
  const countResult = await client.query<{ count: string }>(`select count(*) from public.audit_log`);

  const result = await client.query<{
    id: string;
    actor_college_user_id: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    ip_address: string | null;
    created_at: Date;
  }>(
    `select id, actor_college_user_id, action, target_type, target_id, ip_address, created_at
     from public.audit_log
     order by created_at desc
     limit $1 offset $2`,
    [params.limit, params.offset],
  );

  return {
    entries: result.rows.map((row) => ({
      id: row.id,
      actorCollegeUserId: row.actor_college_user_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    })),
    total: Number(countResult.rows[0].count),
  };
}
