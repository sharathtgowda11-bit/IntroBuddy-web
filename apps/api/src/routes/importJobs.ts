import { createHash, randomUUID } from "node:crypto";
import { getPool, withTenant } from "@introbuddy/db";
import { countPendingInvitationsForImportJob } from "@introbuddy/invitations";
import {
  detectImportFileKind,
  errorsToCsv,
  guessColumnMapping,
  parseImportFile,
  toMappedStudentRows,
  validateImportRows,
  type ColumnMapping,
} from "@introbuddy/import";
import {
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
} from "@introbuddy/jobs";
import { ImportMappingUpdateSchema, ImportSendInvitationsSchema, PERMISSIONS } from "@introbuddy/shared";
import { Router } from "express";
import multer from "multer";
import { requirePermission } from "../middleware/requirePermission.js";
import { resolveSession } from "../middleware/resolveSession.js";

export const importJobsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // matches supabase/config.toml's college-imports bucket
});

/** Preset values only apply if the column name still exists in this file -- otherwise the fresh guess wins. */
function mergeColumnMapping(preset: ColumnMapping | null, guessed: ColumnMapping, headers: string[]): ColumnMapping {
  const merged: ColumnMapping = { ...guessed };
  if (preset) {
    for (const [field, column] of Object.entries(preset) as [keyof ColumnMapping, string][]) {
      if (column && headers.includes(column)) {
        merged[field] = column;
      }
    }
  }
  return merged;
}

importJobsRouter.post(
  "/",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_IMPORT),
  upload.single("file"),
  async (req, res) => {
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

    const session = req.session!;
    const pool = getPool();
    const importJobId = randomUUID();
    const fileSha256 = createHash("sha256").update(file.buffer).digest("hex");

    try {
      const { headers, rows } = await parseImportFile(file.buffer, kind);
      const filePath = await uploadImportFile(session.tenantId, importJobId, file.buffer, file.mimetype, kind);

      const { importJob, duplicateOfJobIds } = await withTenant(pool, session.tenantId, async (client) => {
        const preset = await getImportMappingPreset(client);
        const guessed = guessColumnMapping(headers);
        const columnMapping = mergeColumnMapping(preset, guessed, headers);

        const created = await createImportJob(client, {
          id: importJobId,
          tenantId: session.tenantId,
          createdByCollegeUserId: session.collegeUserId,
          originalFilename: file.originalname,
          filePath,
          fileSha256,
          columnMapping,
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
        columnMapping: importJob.columnMapping,
        headers,
        rowCount: rows.length,
        duplicateOfJobIds,
      });
    } catch (error) {
      console.error("failed to upload import file", error);
      res.status(500).json({ error: "internal error" });
    }
  },
);

importJobsRouter.patch(
  "/:id/mapping",
  resolveSession(),
  requirePermission(PERMISSIONS.STUDENT_IMPORT),
  async (req, res) => {
    const parsed = ImportMappingUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
      return;
    }

    const id = req.params.id as string;
    const session = req.session!;
    const pool = getPool();

    try {
      const updated = await withTenant(pool, session.tenantId, async (client) => {
        const importJob = await findImportJobById(client, id);
        if (!importJob) {
          return null;
        }
        await setImportJobMapping(client, id, parsed.data.columnMapping);
        await upsertImportMappingPreset(client, session.tenantId, parsed.data.columnMapping);
        return true;
      });

      if (!updated) {
        res.status(404).json({ error: "import job not found" });
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
      const mappedRows = toMappedStudentRows(rows, importJob.columnMapping);

      const summary = await withTenant(pool, session.tenantId, async (client) => {
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
