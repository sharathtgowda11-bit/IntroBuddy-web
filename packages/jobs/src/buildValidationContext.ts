import { listExistingCollegeUserEmailsByRole, listExistingStudentIdentifiers } from "@introbuddy/invitations";
import type { AlumniValidationContext, DepartmentMatch, ValidationContext } from "@introbuddy/import";
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
): Promise<{ id: string; degreeId: string; name: string; degreeName: string }[]> {
  const result = await client.query<{ id: string; degree_id: string; name: string; degree_name: string }>(
    `select d.id, d.degree_id, d.name, deg.name as degree_name
     from public.departments d
     join public.degrees deg on deg.id = d.degree_id`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    degreeId: row.degree_id,
    name: row.name,
    degreeName: row.degree_name,
  }));
}

/**
 * A tenant may legitimately have two departments with the same name under
 * different degrees (the DB's own uniqueness constraint is
 * (tenant_id, degree_id, lower(name)), not name alone) -- so each name maps
 * to every department that shares it, not a single overwritten entry.
 * resolveDepartmentMatch (packages/import) disambiguates using the row's own
 * degree column when there's more than one candidate.
 */
function groupDepartmentsByName(
  departments: { id: string; degreeId: string; name: string; degreeName: string }[],
): Map<string, DepartmentMatch[]> {
  const departmentsByName = new Map<string, DepartmentMatch[]>();
  for (const department of departments) {
    const key = department.name.trim().toLowerCase();
    const match: DepartmentMatch = {
      departmentId: department.id,
      degreeId: department.degreeId,
      degreeName: department.degreeName,
    };
    const existing = departmentsByName.get(key);
    if (existing) {
      existing.push(match);
    } else {
      departmentsByName.set(key, [match]);
    }
  }
  return departmentsByName;
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

  return {
    currentYear,
    existingUsns: identifiers.usns,
    existingEmails: identifiers.emails,
    departmentsByName: groupDepartmentsByName(departments),
  };
}

/**
 * Phase 2 counterpart to buildValidationContext, for alumni rows. Same
 * "fresh on every call" contract, called by both the synchronous
 * /validate route and the worker's chunked commit job.
 */
export async function buildAlumniValidationContext(
  client: PoolClient,
  currentYear: number = new Date().getFullYear(),
): Promise<AlumniValidationContext> {
  const [departments, emailsByRole] = await Promise.all([
    listDepartmentsWithDegree(client),
    listExistingCollegeUserEmailsByRole(client),
  ]);

  return {
    currentYear,
    existingAlumniEmails: emailsByRole.alumniEmails,
    existingNonAlumniEmails: emailsByRole.nonAlumniEmails,
    departmentsByName: groupDepartmentsByName(departments),
  };
}
