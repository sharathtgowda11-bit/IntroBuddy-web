import type { PoolClient } from "pg";

/**
 * The server's own current policy version -- stamped onto every consent
 * record, never accepted as client input (spec 3.4/14.1 #12: "consent
 * captured... with a timestamp and a policy version reference"). Bump
 * this if the terms/privacy policy ever changes; Phase 1 has no
 * re-consent flow, so that's a future concern, not this one.
 */
export const CURRENT_POLICY_VERSION = "1.0";

export async function recordConsent(client: PoolClient, tenantId: string, collegeUserId: string): Promise<void> {
  await client.query(
    `insert into public.consents (tenant_id, college_user_id, policy_version) values ($1, $2, $3)`,
    [tenantId, collegeUserId, CURRENT_POLICY_VERSION],
  );
}
