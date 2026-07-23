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
