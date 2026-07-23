import { getAdminClient } from "./supabaseAuth.js";

const BUCKET = "college-media";
const SIGNED_URL_EXPIRY_SECONDS = 300; // spec 14.1 #7: short-lived signed URLs

export type CollegeImageKind = "logo" | "banner";

/** Uploads (or overwrites) a college's logo/banner, returning the stored object path -- never a URL, since the bucket is private. */
export async function uploadCollegeImage(
  tenantId: string,
  kind: CollegeImageKind,
  buffer: Buffer,
  contentType: string,
  extension: string,
): Promise<string> {
  const path = `${tenantId}/${kind}.${extension}`;
  const admin = getAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: true });
  if (error) {
    throw new Error(`failed to upload ${kind}: ${error.message}`);
  }
  return path;
}

/** Mints a fresh, short-lived signed URL -- never persisted, always regenerated on read. */
export async function getSignedImageUrl(path: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}
