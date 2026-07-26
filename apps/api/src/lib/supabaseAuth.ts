import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env.js";

let anonClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

/** Used only to verify a password via signInWithPassword -- never to query public tables. */
function getAnonClient(): SupabaseClient {
  if (!anonClient) {
    const env = getEnv();
    anonClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  }
  return anonClient;
}

/**
 * Used only for setPassword/verifyPassword below and (as of Milestone 3)
 * Storage access -- never to query public tables (that's always app_user
 * + withTenant). Exported so apps/api/src/lib/storage.ts can reuse the
 * same service-role client rather than minting a second one for the same
 * credential.
 *
 * As of Milestone 4, identity *provisioning* (createIdentity) lives in
 * @introbuddy/invitations with its own, separate admin-client instance --
 * a small, deliberate duplication rather than forcing this file's
 * zod-validated env.ts dependency into a package with no app of its own.
 */
export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const env = getEnv();
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return adminClient;
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const admin = getAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    throw new Error(`failed to set password: ${error.message}`);
  }
}

export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const anon = getAnonClient();
  const { error } = await anon.auth.signInWithPassword({ email, password });
  if (error && error.status !== 400) {
    // GoTrue returns 400/"invalid_credentials" for a genuine wrong password --
    // anything else (5xx, network failure, DB connection exhaustion under
    // load, etc.) is an infra failure that happens to look identical to a
    // wrong password from the caller's perspective (login's genericFailure()
    // still returns the same 401, preserving enumeration resistance). Log it
    // distinctly so this class of failure is diagnosable instead of being
    // silently indistinguishable from real "wrong password" attempts.
    console.error("verifyPassword: non-credentials error from GoTrue", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
  }
  return !error;
}
