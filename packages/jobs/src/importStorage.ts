import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "college-imports";

let adminClient: SupabaseClient | undefined;

/**
 * Own copy of the admin client, reading SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 * directly from process.env -- same rationale as
 * packages/invitations/src/identity.ts's getAdminClient: this package has
 * no app of its own, so it trusts whichever caller (apps/api, apps/worker)
 * already validated these at its own boot time. A private bucket read via
 * the service-role client only, never a signed URL handed to a browser --
 * raw import files aren't meant to be browser-fetchable at all.
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

export async function uploadImportFile(
  tenantId: string,
  importJobId: string,
  buffer: Buffer,
  contentType: string,
  extension: string,
): Promise<string> {
  const path = `${tenantId}/${importJobId}.${extension}`;
  const admin = getAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
  if (error) {
    throw new Error(`failed to upload import file: ${error.message}`);
  }
  return path;
}

export async function downloadImportFile(path: string): Promise<Buffer> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`failed to download import file: ${error?.message ?? "unknown error"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}
