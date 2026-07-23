import type { Pool, PoolClient } from "pg";

/**
 * Runs `fn` inside a single transaction with `app.tenant_id` set via
 * SET LOCAL (through set_config, which accepts a parameter and is therefore
 * injection-safe, unlike string-interpolated SQL). The setting is scoped to
 * this transaction only: it cannot outlive the transaction and leak onto
 * the pooled connection for a later, unrelated request -- the silent
 * cross-tenant leak a session-level SET would cause.
 *
 * tenantId must come from the resolved session, never from client input.
 */
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config($1, $2, true)", ["app.tenant_id", tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
