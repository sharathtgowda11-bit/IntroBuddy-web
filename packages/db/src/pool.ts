import { Pool } from "pg";

let pool: Pool | undefined;

/**
 * The shared connection pool the API connects through. Must always resolve
 * to the non-owner `app_user` role -- never the table owner, and never
 * Supabase's service_role key, both of which bypass row-level security.
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}
