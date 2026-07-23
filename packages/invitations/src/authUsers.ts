import type { Pool } from "pg";

/**
 * Looks up an existing GoTrue identity by email via the narrow
 * SECURITY DEFINER function created in the college_onboarding migration
 * -- app_user has no direct grants on the auth schema, and shouldn't.
 * Runs on the plain pool: auth.users has no tenant concept.
 */
export async function findAuthUserIdByEmail(pool: Pool, email: string): Promise<string | null> {
  const result = await pool.query<{ id: string | null }>(`select public.find_auth_user_id_by_email($1) as id`, [
    email,
  ]);
  return result.rows[0]?.id ?? null;
}
