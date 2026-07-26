export type TargetField = "name" | "usn" | "email" | "degree" | "department" | "graduationYear";

const FIELD_ALIASES: Record<TargetField, string[]> = {
  name: ["name", "fullname", "studentname", "student"],
  usn: ["usn", "rollno", "rollnumber", "registerno", "registernumber", "regno", "studentid"],
  email: ["email", "emailaddress", "mailid", "mail"],
  degree: ["degree", "course", "program", "programme"],
  department: ["department", "dept", "branch", "specialization"],
  graduationYear: ["graduationyear", "batch", "year", "passingyear", "gradyear", "yearofpassing"],
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type ColumnMapping = Partial<Record<TargetField, string>>;

/**
 * Guesses a column mapping from header names alone -- never assume a
 * fixed template, every college's file is different (spec 8.3, phase 2).
 * The caller merges this with any saved per-tenant preset
 * (import_mapping_presets) before presenting it to the admin; this
 * function itself has no notion of "previously confirmed" mappings.
 */
export function guessColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedHeaders = headers.map((header) => ({ original: header, normalized: normalizeHeader(header) }));

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [TargetField, string[]][]) {
    const match = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    if (match) {
      mapping[field] = match.original;
    }
  }

  return mapping;
}

// Phase 2: alumni import has a different column shape -- no usn (alumni
// have none), plus a required "company at import" column that student
// import doesn't have. Kept as a separate union/alias table rather than
// folding into TargetField, since the two shapes genuinely diverge (see
// packages/shared's AlumniCreateSchema/importAlumniRow settled decision).
export type AlumniTargetField = "name" | "email" | "company" | "degree" | "department" | "graduationYear";

const ALUMNI_FIELD_ALIASES: Record<AlumniTargetField, string[]> = {
  name: ["name", "fullname", "alumnusname", "alumniname"],
  email: ["email", "emailaddress", "mailid", "mail"],
  company: ["company", "companyname", "employer", "organisation", "organization", "currentcompany"],
  degree: ["degree", "course", "program", "programme"],
  department: ["department", "dept", "branch", "specialization"],
  graduationYear: ["graduationyear", "batch", "year", "passingyear", "gradyear", "yearofpassing"],
};

export type AlumniColumnMapping = Partial<Record<AlumniTargetField, string>>;

/** Alumni counterpart to guessColumnMapping -- same header-guessing approach, different target fields. */
export function guessAlumniColumnMapping(headers: string[]): AlumniColumnMapping {
  const mapping: AlumniColumnMapping = {};
  const normalizedHeaders = headers.map((header) => ({ original: header, normalized: normalizeHeader(header) }));

  for (const [field, aliases] of Object.entries(ALUMNI_FIELD_ALIASES) as [AlumniTargetField, string[]][]) {
    const match = normalizedHeaders.find((header) => aliases.includes(header.normalized));
    if (match) {
      mapping[field] = match.original;
    }
  }

  return mapping;
}
