import "../loadEnv.js";
import { getPool } from "@introbuddy/db";
import { encodeCompoundToken, provisionInvitation, sendInvitationEmail } from "@introbuddy/invitations";
import { getEnv } from "../env.js";
import { findOrCreatePlatformTenant } from "../db/tenants.js";

/**
 * Idempotent, one-shot ops script for provisioning the very first
 * super_admin in an environment (local, staging, or production). There
 * is no HTTP route for this and never should be -- inviting a
 * super_admin is deliberately out of API scope (see
 * packages/shared/src/permissions.ts's comment on INVITE_TARGET_PERMISSION).
 *
 * Reuses the exact same invitation+activation machinery as every other
 * invitation in the system (provisionInvitation, sendInvitationEmail,
 * /auth/activate) rather than a special-cased temporary password --
 * consistent with spec 14.1 #5, "invitation links, never temporary
 * passwords." The recipient activates through the ordinary, unmodified
 * /auth/activate flow and sets their own password.
 *
 * Usage: node --import tsx --import ./src/loadEnv.ts src/scripts/bootstrapSuperAdmin.ts <email>
 */
async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: bootstrapSuperAdmin.ts <email>");
    process.exitCode = 1;
    return;
  }

  const pool = getPool();
  const env = getEnv();

  try {
    const platformTenant = await findOrCreatePlatformTenant(pool);

    const result = await provisionInvitation(pool, {
      tenantId: platformTenant.id,
      email,
      role: "super_admin",
      invitedByCollegeUserId: null,
    });

    if (result.conflict) {
      console.log(`An active account already exists for ${email}. Nothing to do.`);
      return;
    }

    const activationUrl = `${env.WEB_APP_URL}/activate?token=${encodeCompoundToken(platformTenant.id, result.rawToken)}`;
    await sendInvitationEmail({ to: email, activationUrl, role: "super_admin" });

    console.log(`Super admin invitation sent to ${email}.`);
    console.log("Local dev: check Mailpit's web UI (http://127.0.0.1:54324) for the activation link.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("bootstrapSuperAdmin failed:", error);
  process.exitCode = 1;
});
