import { getPool, withTenant } from "@introbuddy/db";
import { DegreeUpsertSchema, PERMISSIONS } from "@introbuddy/shared";
import { Router } from "express";
import { createDegree, deleteDegree, listDegrees, renameDegree } from "../db/degrees.js";
import { isForeignKeyViolation } from "../lib/pgErrors.js";
import { resolveSession } from "../middleware/resolveSession.js";
import { requirePermission } from "../middleware/requirePermission.js";

export const degreesRouter = Router();

// Reads are open to any authenticated role -- Milestone 4/5's student
// import and self-service flows will need to read this list too, and
// there's no reason to gate a read-only list of degree names.
degreesRouter.get("/", resolveSession(), async (req, res) => {
  const pool = getPool();
  const degrees = await withTenant(pool, req.session!.tenantId, (client) => listDegrees(client));
  res.status(200).json({ degrees });
});

degreesRouter.post("/", resolveSession(), requirePermission(PERMISSIONS.DEGREE_MANAGE), async (req, res) => {
  const parsed = DegreeUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const session = req.session!;
  const pool = getPool();
  try {
    const degree = await withTenant(pool, session.tenantId, (client) => createDegree(client, session.tenantId, parsed.data.name));
    res.status(201).json(degree);
  } catch (error) {
    console.error("failed to create degree", error);
    res.status(500).json({ error: "internal error" });
  }
});

degreesRouter.patch("/:id", resolveSession(), requirePermission(PERMISSIONS.DEGREE_MANAGE), async (req, res) => {
  const parsed = DegreeUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const pool = getPool();
  await withTenant(pool, req.session!.tenantId, (client) => renameDegree(client, req.params.id as string, parsed.data.name));
  res.status(200).json({ status: "updated" });
});

// Blocked at the database level (plain FK RESTRICT) if departments are
// still attached -- caught here and translated to 409. Deliberately not
// guarding against attached *students* (spec 8.2): college_users has no
// degree_id/department_id column yet, so no row could reference one.
degreesRouter.delete("/:id", resolveSession(), requirePermission(PERMISSIONS.DEGREE_MANAGE), async (req, res) => {
  const pool = getPool();
  try {
    await withTenant(pool, req.session!.tenantId, (client) => deleteDegree(client, req.params.id as string));
    res.status(204).send();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      res.status(409).json({ error: "cannot delete a degree with departments still attached" });
      return;
    }
    console.error("failed to delete degree", error);
    res.status(500).json({ error: "internal error" });
  }
});
