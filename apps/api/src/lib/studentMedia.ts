import { getAdminClient } from "./supabaseAuth.js";

const BUCKET = "student-media";
const SIGNED_URL_EXPIRY_SECONDS = 300; // spec 14.1 #7: short-lived signed URLs

/** Uploads (or overwrites) a student's avatar, returning the stored object path -- never a URL, since the bucket is private. */
export async function uploadStudentAvatar(
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

/** No EXIF/image processing -- resumes are documents (PDF), not images. */
export async function uploadStudentResume(tenantId: string, collegeUserId: string, buffer: Buffer): Promise<string> {
  const path = `${tenantId}/${collegeUserId}/resume.pdf`;
  const admin = getAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    throw new Error(`failed to upload resume: ${error.message}`);
  }
  return path;
}

/** Mints a fresh, short-lived signed URL -- never persisted, always regenerated on read. */
export async function getSignedStudentMediaUrl(path: string): Promise<string | null> {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}
