import { getPool, withTenant } from "@introbuddy/db";
import { claimNextJob, completeJob, rescheduleJob, type JobRecord, type JobType } from "@introbuddy/jobs";
import type { Pool } from "pg";
import { getEnv } from "./env.js";
import { processImportCommit } from "./jobs/importCommit.js";
import { processInvitationsSend } from "./jobs/invitationsSend.js";

const JOB_TYPES: JobType[] = ["import.commit", "invitations.send"];
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 30 * 1000;

function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}

async function handleJob(pool: Pool, job: JobRecord): Promise<void> {
  try {
    if (job.type === "import.commit") {
      await processImportCommit(pool, job);
    } else {
      await processInvitationsSend(pool, job);
    }
  } catch (error) {
    console.error(`job ${job.id} (${job.type}) failed on attempt ${job.attempts}/${job.maxAttempts}`, error);
    const message = error instanceof Error ? error.message : String(error);
    await withTenant(pool, job.tenantId, (client) =>
      job.attempts >= job.maxAttempts
        ? completeJob(client, job.id, { status: "failed", lastError: message })
        : rescheduleJob(client, job.id, new Date(Date.now() + backoffMs(job.attempts))),
    );
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/** Runs until `signal` aborts -- one claim-and-process cycle per tick, idle-polling at POLL_INTERVAL_MS when nothing's queued. */
export async function pollLoop(signal: AbortSignal): Promise<void> {
  const env = getEnv();
  const pool = getPool();

  while (!signal.aborted) {
    const job = await claimNextJob(pool, JOB_TYPES);
    if (!job) {
      await sleep(env.POLL_INTERVAL_MS, signal);
      continue;
    }
    await handleJob(pool, job);
  }
}
