import { listExistingStudentIdentifiers } from "@introbuddy/invitations";
import type { DepartmentMatch, ValidationContext } from "@introbuddy/import";
import type { PoolClient } from "pg";

/**
 * A small, deliberate duplicate of apps/api/src/db/departments.ts's
 * listDepartments query -- that file also holds admin CRUD
 * (create/rename/delete) that only apps/api's own routes need, so the
 * whole module isn't a good fit to share. This package (and apps/worker)
 * only need the read side, so it's copied here rather than forcing
 * apps/api's private db layer into a shared package. Same rationale as
 * packages/invitations/src/identity.ts's own getAdminClient duplication.
 */
async function listDepartmentsWithDegree(
  client: PoolClient,
): Promise<{ id: string; degreeId: string; name: string }[]> {
  const result = await client.query<{ id: string; degree_id: string; name: string }>(
    `select id, degree_id, name from public.departments`,
  );
  return result.rows.map((row) => ({ id: row.id, degreeId: row.degree_id, name: row.name }));
}

/**
 * Composes the reference data every classification of a student row
 * needs -- called fresh by both the synchronous /validate route and the
 * worker's chunked commit job (re-fetched each execution, since time has
 * passed and rows may have changed), so "the exact same logic runs for
 * both phases" is literal, not aspirational.
 */
export async function buildValidationContext(
  client: PoolClient,
  currentYear: number = new Date().getFullYear(),
): Promise<ValidationContext> {
  const [departments, identifiers] = await Promise.all([
    listDepartmentsWithDegree(client),
    listExistingStudentIdentifiers(client),
  ]);

  const departmentsByName = new Map<string, DepartmentMatch>();
  for (const department of departments) {
    departmentsByName.set(department.name.trim().toLowerCase(), {
      departmentId: department.id,
      degreeId: department.degreeId,
    });
  }

  return {
    currentYear,
    existingUsns: identifiers.usns,
    existingEmails: identifiers.emails,
    departmentsByName,
  };
}
