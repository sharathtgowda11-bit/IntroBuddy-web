import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Pool } from "pg";
import { findAuthUserIdByEmail } from "./authUsers.js";
import { generateRawToken } from "./tokens.js";

let adminClient: SupabaseClient | undefined;

/**
 * Used only for identity provisioning via the Admin API -- never to
 * query public tables (that's always app_user + withTenant).
 *
 * Reads SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY directly from
 * process.env rather than a zod-validated schema: this package has no
 * app of its own, so it trusts whichever caller (apps/api, apps/worker,
 * the bootstrap script) has already validated these are present at its
 * own boot time. This is a separate client instance from apps/api's own
 * lib/supabaseAuth.ts (which keeps setPassword/verifyPassword,
 * unrelated to provisioning) -- a small, deliberate duplication rather
 * than forcing unrelated concerns into this package.
 */
function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    adminClient = createClient(url, serviceRoleKey);
  }
  return adminClient;
}

/**
 * Provisions a real GoTrue identity with a throwaway, never-revealed
 * password -- the person sets their own real password later via the
 * activation flow, never GoTrue's built-in invite/confirm emails.
 * email_confirm marks it pre-confirmed so GoTrue doesn't send anything
 * of its own.
 *
 * Idempotent: a person can hold one login across colleges (spec 6.5), so
 * this email may already have an identity from another tenant. GoTrue's
 * createUser then fails with code "email_exists" -- its own Admin API has
 * no way to look up the existing id by email (confirmed empirically:
 * listUsers has no email filter), so that case falls back to the narrow
 * find_auth_user_id_by_email lookup instead of erroring the whole
 * invitation.
 */
export async function createIdentity(pool: Pool, email: string): Promise<string> {
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: generateRawToken(),
    email_confirm: true,
  });

  if (error?.code === "email_exists") {
    const existingUserId = await findAuthUserIdByEmail(pool, email);
    if (existingUserId) {
      return existingUserId;
    }
  }

  if (error || !data.user) {
    throw new Error(`failed to provision identity: ${error?.message ?? "unknown error"}`);
  }
  return data.user.id;
}
