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
