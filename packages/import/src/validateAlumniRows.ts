import { getGraduationYearBounds, resolveDepartmentMatch, type DepartmentMatch, type RejectedRowOutcome } from "./validateRows.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AlumniValidationContext {
  currentYear: number;
  /** Lowercased emails of alumni already present for this tenant -- a row matching one of these is treated as an update to that alumnus (email is the only stable per-row identifier alumni have, in place of a USN). */
  existingAlumniEmails: Set<string>;
  /** Lowercased emails belonging to any OTHER college_users row (student/college_admin/super_admin) in this tenant -- a match here is a genuine identity collision, since email is unique per tenant across every role (college_users_tenant_email_idx). */
  existingNonAlumniEmails: Set<string>;
  /** Keyed by normalized (trimmed, lowercased) department name -- same resolver as student import, including the same possibility of more than one degree sharing a department name. Optional for alumni rows: a row with no department simply leaves departmentId/degreeId unset. */
  departmentsByName: Map<string, DepartmentMatch[]>;
}

export interface MappedAlumniRow {
  rowNumber: number;
  name?: string;
  email?: string;
  /** Required for the import to validate and shown in the commit preview, but never persisted -- see Part 4's settled decision on Company Name at import. */
  company?: string;
  /** Only consulted to disambiguate a department name that exists under more than one degree; otherwise ignored. */
  degreeName?: string;
  departmentName?: string;
  graduationYear?: string;
}

export interface ValidAlumniRowOutcome {
  outcome: "create" | "update";
  rowNumber: number;
  data: {
    name: string;
    email: string;
    /** Validated/previewed only -- the commit write never stores this anywhere. */
    company: string;
    departmentId?: string;
    degreeId?: string;
    graduationYear?: number;
  };
}

export type AlumniRowOutcome = ValidAlumniRowOutcome | RejectedRowOutcome;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function rowToRaw(row: MappedAlumniRow): Record<string, string> {
  return {
    name: row.name ?? "",
    email: row.email ?? "",
    company: row.company ?? "",
    degree: row.degreeName ?? "",
    department: row.departmentName ?? "",
    graduationYear: row.graduationYear ?? "",
  };
}

/**
 * Alumni counterpart to validateImportRows -- same "one shared
 * implementation for both the dry-run validate route and the worker's
 * chunked commit job" precedent, adapted for the alumni row shape: degree/
 * department/graduation year are optional (admin may not have this data),
 * company is required for validation but discarded after commit, and there
 * is no USN, so email is both the required identifier and the update-match
 * key.
 */
export function validateAlumniRows(rows: MappedAlumniRow[], ctx: AlumniValidationContext): AlumniRowOutcome[] {
  const emailCountsInFile = new Map<string, number>();
  for (const row of rows) {
    if (row.email) {
      const key = normalizeKey(row.email);
      emailCountsInFile.set(key, (emailCountsInFile.get(key) ?? 0) + 1);
    }
  }

  return rows.map((row) => classifyAlumniRow(row, ctx, emailCountsInFile));
}

function classifyAlumniRow(
  row: MappedAlumniRow,
  ctx: AlumniValidationContext,
  emailCountsInFile: Map<string, number>,
): AlumniRowOutcome {
  const reasons: string[] = [];

  const name = row.name?.trim();
  const email = row.email?.trim();
  const company = row.company?.trim();
  const departmentName = row.departmentName?.trim();
  const graduationYearRaw = row.graduationYear?.trim();

  if (!name) reasons.push("missing name");
  if (!email) reasons.push("missing email");
  if (!company) reasons.push("missing company");

  if (email && !EMAIL_PATTERN.test(email)) {
    reasons.push("invalid email format");
  }

  let graduationYear: number | undefined;
  if (graduationYearRaw) {
    const parsedYear = Number(graduationYearRaw);
    const { minYear, maxYear } = getGraduationYearBounds(ctx.currentYear);
    if (!Number.isInteger(parsedYear)) {
      reasons.push("graduation year is not a number");
    } else if (parsedYear < minYear || parsedYear > maxYear) {
      reasons.push(`graduation year out of plausible range (${minYear}-${maxYear})`);
    } else {
      graduationYear = parsedYear;
    }
  }

  // Department is optional for alumni (unlike students): only resolved --
  // and only rejectable -- when the row actually supplied one.
  let departmentMatch: DepartmentMatch | undefined;
  if (departmentName) {
    const resolved = resolveDepartmentMatch(departmentName, row.degreeName?.trim(), ctx.departmentsByName);
    departmentMatch = resolved.match;
    if (resolved.reason) {
      reasons.push(resolved.reason);
    }
  }

  if (email && (emailCountsInFile.get(normalizeKey(email)) ?? 0) > 1) {
    reasons.push("duplicate email within this file");
  }

  const normalizedEmail = email ? normalizeKey(email) : undefined;
  const isUpdate = normalizedEmail ? ctx.existingAlumniEmails.has(normalizedEmail) : false;

  // Email already belongs to a non-alumnus (student/college_admin/
  // super_admin) in this tenant -- a genuine identity collision, since
  // email is unique per tenant across every role. Can't be created or
  // cleanly updated, so caught here with a clear reason instead of a raw
  // DB error, mirroring the student import's equivalent check.
  if (!isUpdate && normalizedEmail && ctx.existingNonAlumniEmails.has(normalizedEmail)) {
    reasons.push("email already in use by another user in this college");
  }

  if (reasons.length > 0) {
    return { outcome: "reject", rowNumber: row.rowNumber, rawRow: rowToRaw(row), reasons };
  }

  return {
    outcome: isUpdate ? "update" : "create",
    rowNumber: row.rowNumber,
    data: {
      name: name as string,
      email: email as string,
      company: company as string,
      departmentId: departmentMatch?.departmentId,
      degreeId: departmentMatch?.degreeId,
      graduationYear,
    },
  };
}
