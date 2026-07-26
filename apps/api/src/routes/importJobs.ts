import { createHash, randomUUID } from "node:crypto";
import { getPool, withTenant } from "@introbuddy/db";
import { countPendingInvitationsForImportJob } from "@introbuddy/invitations";
import {
  detectImportFileKind,
  errorsToCsv,
  guessAlumniColumnMapping,
  guessColumnMapping,
  parseImportFile,
  toMappedAlumniRows,
  toMappedStudentRows,
  validateAlumniRows,
  validateImportRows,
  type AlumniColumnMapping,
  type ColumnMapping,
} from "@introbuddy/import";
import {
  buildAlumniValidationContext,
  buildValidationContext,
  createImportJob,
  downloadImportFile,
  enqueueJob,
  findImportJobById,
  findImportJobsByFileHash,
  getImportMappingPreset,
  listImportErrors,
  replaceImportErrors,
  setImportJobMapping,
  setImportJobValidationResult,
  uploadImportFile,
  upsertImportMappingPreset,
  type ImportTargetRole,
} from "@introbuddy/jobs";
import {
  AlumniImportMappingUpdateSchema,
  ImportMappingUpdateSchema,
  ImportSendInvitationsSchema,
  PERMISSIONS,
  hasPermission,
} from "@introbuddy/shared";
import { Router } from "express";
import multer from "multer";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const importJobsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // matches supabase/config.toml's college-imports bucket
});

/** Preset values only apply if the column name still exists in this file -- otherwise the fresh guess wins. Generic over student/alumni column mapping shapes, both Partial<Record<field, string>>. */
function mergeColumnMapping<T extends Record<string, string | undefined>>(preset: T | null, guessed: T, headers: string[]): T {
  const merged: T = { ...guessed };
  if (preset) {
    for (const [field, column] of Object.entries(preset) as [keyof T, string][]) {
      if (column && headers.includes(column)) {
        merged[field] = column as T[keyof T];
      }
    }
  }
  return merged;
}

// requirePermission can't be static middleware here: which permission
// applies depends on targetRole, a body field that multer (upload.single)
// must parse first -- so upload runs before this handler checks
// permission manually, rather than before a requirePermission(...)
// middleware that would run too early to see req.body.targetRole.
importJobsRouter.post("/", resolveSession(), upload.single("file"), async (req, res) => {
  const session = req.session;
  if (!session) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  // Defaults to 'student' for backward compatibility with the existing
  // student-import UI, which never sends this field.
  const targetRole: ImportTargetRole = req.body.targetRole === "alumni" ? "alumni" : "student";
  const requiredPermission = targetRole === "alumni" ? PERMISSIONS.ALUMNI_IMPORT : PERMISSIONS.STUDENT_IMPORT;
  if (!hasPermission(session.role, requiredPermission)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "file is required" });
    return;
  }
  const kind = detectImportFileKind(file.originalname);
  if (!kind) {
    res.status(400).json({ error: "file must be .csv or .xlsx" });
    return;
  }

  const pool = getPool();
  const importJobId = randomUUID();
  const fileSha256 = createHash("sha256").update(file.buffer).digest("hex");

  try {
    const { headers, rows } = await parseImportFile(file.buffer, kind);
    const filePath = await uploadImportFile(session.tenantId, importJobId, file.buffer, file.mimetype, kind);

    const { importJob, duplicateOfJobIds } = await withTenant(pool, session.tenantId, async (client) => {
      const preset = await getImportMappingPreset(client, targetRole);
      const columnMapping =
        targetRole === "alumni"
          ? mergeColumnMapping<AlumniColumnMapping>(preset, guessAlumniColumnMapping(headers), headers)
          : mergeColumnMapping<ColumnMapping>(preset, guessColumnMapping(headers), headers);

      const created = await createImportJob(client, {
        id: importJobId,
        tenantId: session.tenantId,
        createdByCollegeUserId: session.collegeUserId,
        originalFilename: file.originalname,
        filePath,
        fileSha256,
        columnMapping,
        targetRole,
      });

      // Informational only -- spec 8.3: a same-hash re-upload is never blocked.
      const duplicates = (await findImportJobsByFileHash(client, fileSha256))
        .filter((job) => job.id !== importJobId)
        .map((job) => job.id);

      return { importJob: created, duplicateOfJobIds: duplicates };
    });

    res.status(201).json({
      id: importJob.id,
      phase: importJob.phase,
      targetRole: importJob.targetRole,
      columnMapping: importJob.columnMapping,
      headers,
      rowCount: rows.length,
      duplicateOfJobIds,
    });
  } catch (error) {
    console.error("failed to upload import file", error);
    res.status(500).json({ error: "internal error" });
  }
});

// A specific permission, or just a broad college_admin role check -- kept
// gated on STUDENT_IMPORT unconditionally, matching the plan's own note
// that this phase-transition endpoint "reads target_role from the
// already-persisted import_jobs row rather than requiring it again": in
// this codebase STUDENT_IMPORT and ALUMNI_IMPORT are always granted
// together (only college_admin ever holds either), so gating uniformly
// here restricts nothing incorrectly.
importJobsRouter.patch(
  "/:id/mapping",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_IMPORT),
  async (req, res) => {
    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const outcome = await withTenant(pool, session.tenantId, async (client) => {
        const importJob = await findImportJobById(client, id);
        if (!importJob) {
          return { kind: "not_found" as const };
        }

        // Which shape to validate against depends on the job's already-
        // persisted target_role -- alumni imports have no usn and add company.
        const schema = importJob.targetRole === "alumni" ? AlumniImportMappingUpdateSchema : ImportMappingUpdateSchema;
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          return { kind: "invalid" as const, details: parsed.error.flatten() };
        }

        await setImportJobMapping(client, id, parsed.data.columnMapping);
        await upsertImportMappingPreset(client, session.tenantId, parsed.data.columnMapping, importJob.targetRole);
        return { kind: "ok" as const };
      });

      if (outcome.kind === "not_found") {
        res.status(404).json({ error: "import job not found" });
        return;
      }
      if (outcome.kind === "invalid") {
        res.status(400).json({ error: "invalid request", details: outcome.details });
        return;
      }

      res.status(200).json({ status: "mapped" });
    } catch (error) {
      console.error("failed to update import mapping", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

importJobsRouter.post(
  "/:id/validate",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_IMPORT),
  async (req, res) => {
    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const importJob = await withTenant(pool, session.tenantId, (client) => findImportJobById(client, id));
      if (!importJob) {
        res.status(404).json({ error: "import job not found" });
        return;
      }

      const kind = detectImportFileKind(importJob.originalFilename);
      if (!kind) {
        res.status(400).json({ error: "file must be .csv or .xlsx" });
        return;
      }

      const buffer = await downloadImportFile(importJob.filePath);
      const { rows } = await parseImportFile(buffer, kind);

      const summary = await withTenant(pool, session.tenantId, async (client) => {
        if (importJob.targetRole === "alumni") {
          const mappedRows = toMappedAlumniRows(rows, importJob.columnMapping as AlumniColumnMapping);
          const context = await buildAlumniValidationContext(client);
          const outcomes = validateAlumniRows(mappedRows, context);

          const rejected = outcomes.filter((outcome) => outcome.outcome === "reject");
          const createCount = outcomes.filter((outcome) => outcome.outcome === "create").length;
          const updateCount = outcomes.filter((outcome) => outcome.outcome === "update").length;

          await replaceImportErrors(
            client,
            session.tenantId,
            id,
            rejected.map((outcome) => ({
              rowNumber: outcome.rowNumber,
              rawRow: outcome.rawRow,
              errorReason: outcome.reasons.join("; "),
            })),
          );

          const result = {
            rowCount: outcomes.length,
            validCount: createCount + updateCount,
            invalidCount: rejected.length,
            createCount,
            updateCount,
          };
          await setImportJobValidationResult(client, id, result);
          return result;
        }

        const mappedRows = toMappedStudentRows(rows, importJob.columnMapping);
        const context = await buildValidationContext(client);
        const outcomes = validateImportRows(mappedRows, context);

        const rejected = outcomes.filter((outcome) => outcome.outcome === "reject");
        const createCount = outcomes.filter((outcome) => outcome.outcome === "create").length;
        const updateCount = outcomes.filter((outcome) => outcome.outcome === "update").length;

        await replaceImportErrors(
          client,
          session.tenantId,
          id,
          rejected.map((outcome) => ({
            rowNumber: outcome.rowNumber,
            rawRow: outcome.rawRow,
            errorReason: outcome.reasons.join("; "),
          })),
        );

        const result = {
          rowCount: outcomes.length,
          validCount: createCount + updateCount,
          invalidCount: rejected.length,
          createCount,
          updateCount,
        };
        await setImportJobValidationResult(client, id, result);
        return result;
      });

      res.status(200).json({ phase: "validated", ...summary });
    } catch (error) {
      console.error("failed to validate import job", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

importJobsRouter.get("/:id", resolveSession(), requirePermission(PERMISSIONS.STUDENT_IMPORT), async (req, res) => {
  const id = req.params.id as string;
  const session = req.session!;
  const pool = getPool();

  const importJob = await withTenant(pool, session.tenantId, (client) => findImportJobById(client, id));
  if (!importJob) {
    res.status(404).json({ error: "import job not found" });
    return;
  }

  res.status(200).json({
    id: importJob.id,
    phase: importJob.phase,
    targetRole: importJob.targetRole,
    originalFilename: importJob.originalFilename,
    columnMapping: importJob.columnMapping,
    rowCount: importJob.rowCount,
    validCount: importJob.validCount,
    invalidCount: importJob.invalidCount,
    createCount: importJob.createCount,
    updateCount: importJob.updateCount,
    committedRowCount: importJob.committedRowCount,
    committedAt: importJob.committedAt,
    errorMessage: importJob.errorMessage,
    createdAt: importJob.createdAt,
    updatedAt: importJob.updatedAt,
  });
});

importJobsRouter.get(
  "/:id/errors.csv",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_IMPORT),
  async (req, res) => {
    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    const found = await withTenant(pool, session.tenantId, async (client) => {
      const importJob = await findImportJobById(client, id);
      if (!importJob) return null;
      return listImportErrors(client, id);
    });

    if (found === null) {
      res.status(404).json({ error: "import job not found" });
      return;
    }

    res.status(200).header("Content-Type", "text/csv").attachment("import-errors.csv").send(errorsToCsv(found));
  },
);

importJobsRouter.post(
  "/:id/commit",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_IMPORT),
  async (req, res) => {
    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const outcome = await withTenant(pool, session.tenantId, async (client) => {
        const importJob = await findImportJobById(client, id);
        if (!importJob) {
          return "not_found" as const;
        }
        if (importJob.phase === "uploaded" || importJob.phase === "mapped") {
          return "not_validated" as const;
        }
        // idempotency_key is the import job's own id -- a repeat commit
        // click is a safe no-op, per the jobs table's unique constraint.
        await enqueueJob(client, { tenantId: session.tenantId, type: "import.commit", idempotencyKey: id, payload: { importJobId: id } });
        return "queued" as const;
      });

      if (outcome === "not_found") {
        res.status(404).json({ error: "import job not found" });
        return;
      }
      if (outcome === "not_validated") {
        res.status(409).json({ error: "import job must be validated before it can be committed" });
        return;
      }

      res.status(202).json({ status: "queued" });
    } catch (error) {
      console.error("failed to enqueue import commit", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

importJobsRouter.post(
  "/:id/send-invitations",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_IMPORT),
  async (req, res) => {
    const parsed = ImportSendInvitationsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const outcome = await withTenant(pool, session.tenantId, async (client) => {
        const importJob = await findImportJobById(client, id);
        if (!importJob) {
          return { kind: "not_found" as const };
        }
        const actualCount = await countPendingInvitationsForImportJob(client, id);
        if (actualCount !== parsed.data.expectedCount) {
          return { kind: "drift" as const, actualCount };
        }
        await enqueueJob(client, {
          tenantId: session.tenantId,
          type: "invitations.send",
          idempotencyKey: id,
          payload: { importJobId: id },
        });
        return { kind: "queued" as const, actualCount };
      });

      if (outcome.kind === "not_found") {
        res.status(404).json({ error: "import job not found" });
        return;
      }
      if (outcome.kind === "drift") {
        res.status(409).json({
          error: "recipient count has changed since you last checked -- please refresh and confirm again",
          actualCount: outcome.actualCount,
        });
        return;
      }

      res.status(202).json({ status: "queued", recipientCount: outcome.actualCount });
    } catch (error) {
      console.error("failed to enqueue invitation send", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);
