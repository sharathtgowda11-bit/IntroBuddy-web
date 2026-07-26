import { withTenant } from "@introbuddy/db";
import {
  detectImportFileKind,
  parseImportFile,
  toMappedAlumniRows,
  toMappedStudentRows,
  validateAlumniRows,
  validateImportRows,
  type AlumniColumnMapping,
  type AlumniRowOutcome,
  type RowOutcome,
  type ValidAlumniRowOutcome,
  type ValidRowOutcome,
} from "@introbuddy/import";
import {
  buildAlumniValidationContext,
  buildValidationContext,
  completeJob,
  downloadImportFile,
  findImportJobById,
  rescheduleJob,
  setImportJobPhase,
  type ImportJobRecord,
  type JobRecord,
} from "@introbuddy/jobs";
import {
  findCollegeUserByEmail,
  findCollegeUserById,
  findCollegeUserByUsn,
  resolveCollegeUserForInvite,
  sendImportSummaryEmail,
  updateAlumniAcademicFields,
  updateCollegeUserAcademicFields,
} from "@introbuddy/invitations";
import type { Pool } from "pg";
import { getEnv } from "../env.js";

function isActionable(outcome: RowOutcome): outcome is ValidRowOutcome {
  return outcome.outcome !== "reject";
}

function isAlumniActionable(outcome: AlumniRowOutcome): outcome is ValidAlumniRowOutcome {
  return outcome.outcome !== "reject";
}

/**
 * One execution processes one bounded chunk (IMPORT_COMMIT_CHUNK_SIZE
 * rows), tracked via payload.offset, then reschedules itself rather than
 * looping in-process -- survives a worker restart mid-batch by
 * construction. Re-validates the *full* row set on every execution (cheap
 * even at thousands of rows; only the write is chunked) since time has
 * passed and reference data (existing USNs/emails/departments) may have
 * changed since the synchronous /validate pass.
 *
 * Phase 2: branches on import_job.target_role at the top. The student
 * path below is entirely unchanged from Phase 1 -- see the alumni branch
 * further down for what differs (no USN, email is the update-match key,
 * degree/department/graduation year are optional, and -- the single
 * easiest place to accidentally reintroduce ambiguity this plan already
 * resolved -- no alumni_profiles write here; that table is created later,
 * lazily, by the alumnus's own first profile edit).
 */
export async function processImportCommit(pool: Pool, job: JobRecord): Promise<void> {
  const importJobId = job.payload.importJobId as string;
  const env = getEnv();

  const importJob = await withTenant(pool, job.tenantId, (client) => findImportJobById(client, importJobId));
  if (!importJob) {
    throw new Error(`import.commit job references missing import job ${importJobId}`);
  }

  try {
    const kind = detectImportFileKind(importJob.originalFilename);
    if (!kind) {
      throw new Error(`import job ${importJobId} has an unrecognized file extension`);
    }

    const buffer = await downloadImportFile(importJob.filePath);
    const { rows } = await parseImportFile(buffer, kind);

    if (importJob.targetRole === "alumni") {
      await commitAlumniImport(pool, job, importJob, rows, env);
      return;
    }

    const mappedRows = toMappedStudentRows(rows, importJob.columnMapping);

    const { actionable, createCount, updateCount, errorCount } = await withTenant(pool, job.tenantId, async (client) => {
      const context = await buildValidationContext(client);
      const outcomes = validateImportRows(mappedRows, context);
      const actionable = outcomes.filter(isActionable);
      return {
        actionable,
        createCount: actionable.filter((outcome) => outcome.outcome === "create").length,
        updateCount: actionable.filter((outcome) => outcome.outcome === "update").length,
        errorCount: outcomes.length - actionable.length,
      };
    });

    const offset = typeof job.payload.offset === "number" ? job.payload.offset : 0;
    const chunk = actionable.slice(offset, offset + env.IMPORT_COMMIT_CHUNK_SIZE);

    // Only set once the final chunk completes, and only sent (below,
    // outside this transaction) if it's non-null -- the notification
    // email failing must never roll back an already-committed import.
    const summaryRecipient = await withTenant(pool, job.tenantId, async (client) => {
      // Unconditional, not just on the first chunk -- a retry that
      // resumes after an earlier failed attempt (which set 'failed')
      // must move the phase back to 'committing' too.
      await setImportJobPhase(client, importJobId, "committing");

      for (const outcome of chunk) {
        if (outcome.outcome === "create") {
          await resolveCollegeUserForInvite(client, pool, {
            tenantId: job.tenantId,
            email: outcome.data.email,
            role: "student",
            name: outcome.data.name,
            usn: outcome.data.usn,
            degreeId: outcome.data.degreeId,
            departmentId: outcome.data.departmentId,
            graduationYear: outcome.data.graduationYear,
            sourceImportJobId: importJobId,
          });
        } else {
          const existing = await findCollegeUserByUsn(client, outcome.data.usn);
          if (existing) {
            await updateCollegeUserAcademicFields(client, existing.id, {
              name: outcome.data.name,
              degreeId: outcome.data.degreeId,
              departmentId: outcome.data.departmentId,
              graduationYear: outcome.data.graduationYear,
            });
          }
        }
      }

      const nextOffset = offset + chunk.length;
      if (nextOffset < actionable.length) {
        await rescheduleJob(client, job.id, new Date(), { importJobId, offset: nextOffset });
        return null;
      }

      await setImportJobPhase(client, importJobId, "committed", { committedRowCount: actionable.length });
      await completeJob(client, job.id, { status: "succeeded" });

      const admin = await findCollegeUserById(client, importJob.createdByCollegeUserId);
      if (!admin) {
        return null;
      }
      const tenantResult = await client.query<{ name: string }>(`select name from public.tenants where id = $1`, [
        job.tenantId,
      ]);
      return {
        to: admin.email,
        adminFirstName: admin.name?.split(" ")[0] || "there",
        collegeName: tenantResult.rows[0]?.name ?? "your college",
      };
    });

    if (summaryRecipient) {
      await sendImportSummaryEmail({
        to: summaryRecipient.to,
        adminFirstName: summaryRecipient.adminFirstName,
        collegeName: summaryRecipient.collegeName,
        fileName: importJob.originalFilename,
        createdCount: createCount,
        updatedCount: updateCount,
        errorCount,
        targetRole: "student",
        // Both point at the same wizard page -- the review step there
        // (apps/web's ImportWizard) already surfaces the error count and a
        // "Download errors CSV" action; there's no separate errors page.
        errorReportUrl: `${env.WEB_APP_URL}/college/import/${importJobId}`,
        reviewUrl: `${env.WEB_APP_URL}/college/import/${importJobId}`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await withTenant(pool, job.tenantId, (client) =>
      setImportJobPhase(client, importJobId, "failed", { errorMessage: message }),
    );
    throw error;
  }
}

/**
 * Alumni branch, split out for readability -- same chunk/offset/
 * idempotency machinery as the student path, adapted for: no USN (email
 * is the update-match key instead), optional degree/department/
 * graduation year, and no alumni_profiles write.
 */
async function commitAlumniImport(
  pool: Pool,
  job: JobRecord,
  importJob: ImportJobRecord,
  rows: Record<string, string>[],
  env: ReturnType<typeof getEnv>,
): Promise<void> {
  const importJobId = importJob.id;
  const mappedRows = toMappedAlumniRows(rows, importJob.columnMapping as AlumniColumnMapping);

  const { actionable, createCount, updateCount, errorCount } = await withTenant(pool, job.tenantId, async (client) => {
    const context = await buildAlumniValidationContext(client);
    const outcomes = validateAlumniRows(mappedRows, context);
    const actionable = outcomes.filter(isAlumniActionable);
    return {
      actionable,
      createCount: actionable.filter((outcome) => outcome.outcome === "create").length,
      updateCount: actionable.filter((outcome) => outcome.outcome === "update").length,
      errorCount: outcomes.length - actionable.length,
    };
  });

  const offset = typeof job.payload.offset === "number" ? job.payload.offset : 0;
  const chunk = actionable.slice(offset, offset + env.IMPORT_COMMIT_CHUNK_SIZE);

  const summaryRecipient = await withTenant(pool, job.tenantId, async (client) => {
    await setImportJobPhase(client, importJobId, "committing");

    for (const outcome of chunk) {
      if (outcome.outcome === "create") {
        await resolveCollegeUserForInvite(client, pool, {
          tenantId: job.tenantId,
          email: outcome.data.email,
          role: "alumni",
          name: outcome.data.name,
          usn: null,
          degreeId: outcome.data.degreeId,
          departmentId: outcome.data.departmentId,
          graduationYear: outcome.data.graduationYear,
          sourceImportJobId: importJobId,
        });
        // Deliberately no alumni_profiles write here, and the row's
        // "company at import" value is discarded, never persisted --
        // Part 4's settled decision. The alumnus's own Company field,
        // entered later at profile Step 3, starts blank.
      } else {
        const existing = await findCollegeUserByEmail(client, outcome.data.email);
        if (existing) {
          await updateAlumniAcademicFields(client, existing.id, {
            name: outcome.data.name,
            degreeId: outcome.data.degreeId,
            departmentId: outcome.data.departmentId,
            graduationYear: outcome.data.graduationYear,
          });
        }
      }
    }

    const nextOffset = offset + chunk.length;
    if (nextOffset < actionable.length) {
      await rescheduleJob(client, job.id, new Date(), { importJobId, offset: nextOffset });
      return null;
    }

    await setImportJobPhase(client, importJobId, "committed", { committedRowCount: actionable.length });
    await completeJob(client, job.id, { status: "succeeded" });

    const admin = await findCollegeUserById(client, importJob.createdByCollegeUserId);
    if (!admin) {
      return null;
    }
    const tenantResult = await client.query<{ name: string }>(`select name from public.tenants where id = $1`, [job.tenantId]);
    return {
      to: admin.email,
      adminFirstName: admin.name?.split(" ")[0] || "there",
      collegeName: tenantResult.rows[0]?.name ?? "your college",
    };
  });

  if (summaryRecipient) {
    await sendImportSummaryEmail({
      to: summaryRecipient.to,
      adminFirstName: summaryRecipient.adminFirstName,
      collegeName: summaryRecipient.collegeName,
      fileName: importJob.originalFilename,
      createdCount: createCount,
      updatedCount: updateCount,
      errorCount,
      targetRole: "alumni",
      errorReportUrl: `${env.WEB_APP_URL}/college/import/${importJobId}`,
      reviewUrl: `${env.WEB_APP_URL}/college/import/${importJobId}`,
    });
  }
}
