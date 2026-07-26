import { getAdminClient } from "./supabaseAuth.js";

const BUCKET = "alumni-media";
const SIGNED_URL_EXPIRY_SECONDS = 300; // matches student-media's short-lived signed URLs

/** Uploads (or overwrites) an alumnus's avatar, returning the stored object path -- never a URL, since the bucket is private. Avatar-only: alumni_profiles has no resume field, unlike student-media. */
export async function uploadAlumniAvatar(
  tenantId: string,
  collegeUserId: string,
  buffer: Buffer,
  contentType: string,
  extension: string,
): Promise<string> {
  const path = `${tenantId}/${collegeUserId}/avatar.${extension}`;
  const admin = getAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
  if (error) {
    throw new Error(`failed to upload avatar: ${error.message}`);
  }
  return path;
}

/** Mints a fresh, short-lived signed URL -- never persisted, always regenerated on read. */
export async function getSignedAlumniMediaUrl(path: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}
