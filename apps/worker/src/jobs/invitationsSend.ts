import { withTenant } from "@introbuddy/db";
import {
  encodeCompoundToken,
  listPendingInvitationCandidates,
  mintInvitationToken,
  sendInvitationEmail,
} from "@introbuddy/invitations";
import { completeJob, findImportJobById, rescheduleJob, type JobRecord } from "@introbuddy/jobs";
import type { Pool } from "pg";
import { getEnv } from "../env.js";

/**
 * One execution sends one chunk (INVITATION_SEND_CHUNK_SIZE) of
 * invitations, then reschedules itself spaced to hit
 * INVITATION_SEND_RATE_PER_HOUR overall -- e.g. 10 every 3 minutes at the
 * defaults. Never sleeps in-process, so a restart mid-send loses at most
 * one in-flight chunk. Terminates once listPendingInvitationCandidates
 * returns nothing -- no separate "how many total" bookkeeping needed.
 */
export async function processInvitationsSend(pool: Pool, job: JobRecord): Promise<void> {
  const importJobId = job.payload.importJobId as string;
  const env = getEnv();

  const { importJob, collegeName } = await withTenant(pool, job.tenantId, async (client) => {
    const importJob = await findImportJobById(client, importJobId);
    // One inline query rather than a new shared helper for a single
    // SELECT -- same "small deliberate duplication" reasoning already
    // used elsewhere in this file (see the mint+send transaction below).
    const tenantResult = await client.query<{ name: string }>(`select name from public.tenants where id = $1`, [
      job.tenantId,
    ]);
    return { importJob, collegeName: tenantResult.rows[0]?.name };
  });
  if (!importJob) {
    throw new Error(`invitations.send job references missing import job ${importJobId}`);
  }

  const candidates = await withTenant(pool, job.tenantId, (client) =>
    listPendingInvitationCandidates(client, importJobId, env.INVITATION_SEND_CHUNK_SIZE),
  );

  if (candidates.length === 0) {
    await withTenant(pool, job.tenantId, (client) => completeJob(client, job.id, { status: "succeeded" }));
    return;
  }

  for (const candidate of candidates) {
    // Mint + send in one transaction: if the email send throws, the mint
    // rolls back too, keeping "has a live invitation" exactly equal to
    // "the email was actually sent" -- the invariant
    // listPendingInvitationCandidates relies on to stay resumable without
    // its own offset tracking.
    await withTenant(pool, job.tenantId, async (client) => {
      const rawToken = await mintInvitationToken(client, {
        tenantId: job.tenantId,
        collegeUserId: candidate.collegeUserId,
        invitedByCollegeUserId: importJob.createdByCollegeUserId,
      });
      const activationUrl = `${env.WEB_APP_URL}/activate?token=${encodeCompoundToken(job.tenantId, rawToken)}`;
      await sendInvitationEmail({
        to: candidate.email,
        activationUrl,
        role: "student",
        collegeName,
        student: {
          name: candidate.name,
          usn: candidate.usn,
          departmentName: candidate.departmentName,
          graduationYear: candidate.graduationYear,
        },
      });
    });
  }

  const intervalMs = (60 * 60 * 1000 * env.INVITATION_SEND_CHUNK_SIZE) / env.INVITATION_SEND_RATE_PER_HOUR;
  await withTenant(pool, job.tenantId, (client) => rescheduleJob(client, job.id, new Date(Date.now() + intervalMs)));
}
