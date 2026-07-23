import { getPool, withTenant } from "@introbuddy/db";
import { DepartmentUpsertSchema, PERMISSIONS } from "@introbuddy/shared";
import { Router } from "express";
import { createDepartment, deleteDepartment, listDepartments, renameDepartment } from "../db/departments.js";
import { isForeignKeyViolation } from "../lib/pgErrors.js";
import { resolveSession } from "../middleware/resolveSession.js";
import { requirePermission } from "../middleware/requirePermission.js";

export const departmentsRouter = Router();

departmentsRouter.get("/", resolveSession(), async (req, res) => {
  const pool = getPool();
  const departments = await withTenant(pool, req.session!.tenantId, (client) => listDepartments(client));
  res.status(200).json({ departments });
});

departmentsRouter.post("/", resolveSession(), requirePermission(PERMISSIONS.DEGREE_MANAGE), async (req, res) => {
  const parsed = DepartmentUpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const session = req.session!;
  const pool = getPool();
  try {
    const department = await withTenant(pool, session.tenantId, (client) =>
      createDepartment(client, session.tenantId, parsed.data.degreeId, parsed.data.name),
    );
    res.status(201).json(department);
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      res.status(400).json({ error: "no such degree" });
      return;
    }
    console.error("failed to create department", error);
    res.status(500).json({ error: "internal error" });
  }
});

departmentsRouter.patch("/:id", resolveSession(), requirePermission(PERMISSIONS.DEGREE_MANAGE), async (req, res) => {
  const parsed = DepartmentUpsertSchema.pick({ name: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const pool = getPool();
  await withTenant(pool, req.session!.tenantId, (client) => renameDepartment(client, req.params.id as string, parsed.data.name));
  res.status(200).json({ status: "updated" });
});

// Not expected to ever 409 today -- see deleteDepartment's comment;
// college_users has no department_id yet, so nothing can be attached.
departmentsRouter.delete("/:id", resolveSession(), requirePermission(PERMISSIONS.DEGREE_MANAGE), async (req, res) => {
  const pool = getPool();
  await withTenant(pool, req.session!.tenantId, (client) => deleteDepartment(client, req.params.id as string));
  res.status(204).send();
});
