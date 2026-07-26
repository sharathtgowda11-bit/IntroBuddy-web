// Graduation-year bounds: not spec-mandated with exact numbers -- a
// judgment call (see docs/adr), not a DB constraint, since it's relative
// to "now". currentYear is injected via ValidationContext rather than
// read from the clock internally, so this is testable without mocking time.
export const GRADUATION_YEAR_PAST_OFFSET = 80;
export const GRADUATION_YEAR_FUTURE_OFFSET = 8;

/** Shared with single-student add (apps/api) so both entry points agree on what's plausible. */
export function getGraduationYearBounds(currentYear: number): { minYear: number; maxYear: number } {
  return { minYear: currentYear - GRADUATION_YEAR_PAST_OFFSET, maxYear: currentYear + GRADUATION_YEAR_FUTURE_OFFSET };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DepartmentMatch {
  departmentId: string;
  degreeId: string;
  degreeName: string;
}

export interface ValidationContext {
  currentYear: number;
  /** Lowercased USNs already present for this tenant. */
  existingUsns: Set<string>;
  /** Lowercased emails already present for this tenant. */
  existingEmails: Set<string>;
  /**
   * Keyed by normalized (trimmed, lowercased) department name. A tenant may
   * legitimately have two departments with the same name under different
   * degrees (e.g. "Computer Science and Engineering" under both B.Tech and
   * M.Tech -- the DB's own uniqueness constraint is (tenant_id, degree_id,
   * lower(name)), not name alone), so each key holds every department that
   * shares that name rather than a single overwritten match.
   */
  departmentsByName: Map<string, DepartmentMatch[]>;
}

export interface MappedStudentRow {
  rowNumber: number;
  name?: string;
  usn?: string;
  email?: string;
  /** Only consulted to disambiguate a department name that exists under more than one degree; otherwise ignored, since degree_id is always derived from the resolved department. */
  degreeName?: string;
  departmentName?: string;
  graduationYear?: string;
}

export interface ValidRowOutcome {
  outcome: "create" | "update";
  rowNumber: number;
  data: {
    name: string;
    usn: string;
    email: string;
    departmentId: string;
    degreeId: string;
    graduationYear: number;
  };
}

export interface RejectedRowOutcome {
  outcome: "reject";
  rowNumber: number;
  rawRow: Record<string, string>;
  reasons: string[];
}

export type RowOutcome = ValidRowOutcome | RejectedRowOutcome;

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolves a row's department name to a single DepartmentMatch, disambiguating
 * by the row's own degree column when the name alone is ambiguous (shared by
 * more than one degree). Shared by both the student and alumni row
 * classifiers -- the ambiguity is a property of the tenant's taxonomy, not of
 * which role is being imported.
 */
export function resolveDepartmentMatch(
  departmentName: string,
  degreeName: string | undefined,
  departmentsByName: Map<string, DepartmentMatch[]>,
): { match?: DepartmentMatch; reason?: string } {
  const candidates = departmentsByName.get(normalizeKey(departmentName));
  if (!candidates || candidates.length === 0) {
    return { reason: `department "${departmentName}" not found in this college's hierarchy` };
  }
  if (candidates.length === 1) {
    return { match: candidates[0] };
  }
  // More than one degree has a department with this name -- the degree
  // column (otherwise unused) is the only thing that can disambiguate.
  if (!degreeName) {
    return {
      reason: `department "${departmentName}" exists under more than one degree in this college -- specify a degree to disambiguate`,
    };
  }
  const narrowed = candidates.filter((c) => normalizeKey(c.degreeName) === normalizeKey(degreeName));
  if (narrowed.length !== 1) {
    return { reason: `department "${departmentName}" not found under degree "${degreeName}"` };
  }
  return { match: narrowed[0] };
}

function rowToRaw(row: MappedStudentRow): Record<string, string> {
  return {
    name: row.name ?? "",
    usn: row.usn ?? "",
    email: row.email ?? "",
    degree: row.degreeName ?? "",
    department: row.departmentName ?? "",
    graduationYear: row.graduationYear ?? "",
  };
}

/**
 * The one, shared implementation of every check spec 8.3 (phase 3)
 * requires -- used identically by the synchronous dry-run validate route
 * and the worker's chunked commit job, so "the exact same logic runs for
 * both phases" is a literal fact, not an aspiration. Pure: no I/O, all
 * reference data pre-fetched into ValidationContext by the caller.
 */
export function validateImportRows(rows: MappedStudentRow[], ctx: ValidationContext): RowOutcome[] {
  // Within-file duplicates first: spec's explicit edge case -- both rows
  // flagged, neither imported -- requires seeing the whole file before
  // classifying any single row.
  const usnCountsInFile = new Map<string, number>();
  const emailCountsInFile = new Map<string, number>();
  for (const row of rows) {
    if (row.usn) {
      const key = normalizeKey(row.usn);
      usnCountsInFile.set(key, (usnCountsInFile.get(key) ?? 0) + 1);
    }
    if (row.email) {
      const key = normalizeKey(row.email);
      emailCountsInFile.set(key, (emailCountsInFile.get(key) ?? 0) + 1);
    }
  }

  return rows.map((row) => classifyRow(row, ctx, usnCountsInFile, emailCountsInFile));
}

function classifyRow(
  row: MappedStudentRow,
  ctx: ValidationContext,
  usnCountsInFile: Map<string, number>,
  emailCountsInFile: Map<string, number>,
): RowOutcome {
  const reasons: string[] = [];

  const name = row.name?.trim();
  const usn = row.usn?.trim();
  const email = row.email?.trim();
  const departmentName = row.departmentName?.trim();
  const graduationYearRaw = row.graduationYear?.trim();

  if (!name) reasons.push("missing name");
  if (!usn) reasons.push("missing USN");
  if (!email) reasons.push("missing email");
  if (!departmentName) reasons.push("missing department");
  if (!graduationYearRaw) reasons.push("missing graduation year");

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

  let departmentMatch: DepartmentMatch | undefined;
  if (departmentName) {
    const resolved = resolveDepartmentMatch(departmentName, row.degreeName?.trim(), ctx.departmentsByName);
    departmentMatch = resolved.match;
    if (resolved.reason) {
      reasons.push(resolved.reason);
    }
  }

  if (usn && (usnCountsInFile.get(normalizeKey(usn)) ?? 0) > 1) {
    reasons.push("duplicate USN within this file");
  }
  if (email && (emailCountsInFile.get(normalizeKey(email)) ?? 0) > 1) {
    reasons.push("duplicate email within this file");
  }

  const isUpdate = usn ? ctx.existingUsns.has(normalizeKey(usn)) : false;

  // A new (non-matching-USN) row whose email already belongs to another
  // student in this tenant can't be created OR cleanly updated -- the
  // tenant-scoped unique(tenant_id, lower(email)) constraint would reject
  // it at commit time regardless, so catch it here with a clear reason
  // instead of a raw DB error. Cross-*tenant* email reuse is expected and
  // fine (spec: "email belongs to an identity in another college... do
  // not error") -- existingEmails is scoped to this tenant only, so this
  // check never fires for that case.
  if (!isUpdate && email && ctx.existingEmails.has(normalizeKey(email))) {
    reasons.push("email already in use by another student in this college");
  }

  if (reasons.length > 0) {
    return { outcome: "reject", rowNumber: row.rowNumber, rawRow: rowToRaw(row), reasons };
  }

  return {
    outcome: isUpdate ? "update" : "create",
    rowNumber: row.rowNumber,
    data: {
      name: name as string,
      usn: usn as string,
      email: email as string,
      departmentId: (departmentMatch as DepartmentMatch).departmentId,
      degreeId: (departmentMatch as DepartmentMatch).degreeId,
      graduationYear: graduationYear as number,
    },
  };
}
