import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "../env.js";
import { generateRawToken } from "./tokens.js";

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

/** Used only for identity provisioning via the Admin API -- never to query public tables (that's always app_user + withTenant). */
function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const env = getEnv();
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return adminClient;
}

/**
 * Provisions a real GoTrue identity with a throwaway, never-revealed
 * password -- the person sets their own real password later via our own
 * activation flow, never GoTrue's built-in invite/confirm emails.
 * email_confirm marks it pre-confirmed so GoTrue doesn't send anything of
 * its own.
 */
export async function createIdentity(email: string): Promise<string> {
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: generateRawToken(),
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`failed to provision identity: ${error?.message ?? "unknown error"}`);
  }
  return data.user.id;
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
  return !error;
}
