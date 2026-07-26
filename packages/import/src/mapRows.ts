import type { AlumniColumnMapping, ColumnMapping } from "./guessColumnMapping.js";
import type { MappedAlumniRow } from "./validateAlumniRows.js";
import type { MappedStudentRow } from "./validateRows.js";

/**
 * Bridges a raw parsed file (header-keyed rows) to validateImportRows'
 * input shape, given a confirmed column mapping. Shared by the
 * synchronous /validate route and the worker's chunked commit job, so
 * both apply an identical confirmed mapping to the file's rows.
 */
export function toMappedStudentRows(rows: Record<string, string>[], mapping: ColumnMapping): MappedStudentRow[] {
  return rows.map((row, index) => ({
    rowNumber: index + 2, // row 1 is the header in both CSV and XLSX
    name: mapping.name ? row[mapping.name] : undefined,
    usn: mapping.usn ? row[mapping.usn] : undefined,
    email: mapping.email ? row[mapping.email] : undefined,
    // Otherwise unused (degree_id is always derived from the resolved
    // department) except to disambiguate a department name shared by more
    // than one degree -- see resolveDepartmentMatch.
    degreeName: mapping.degree ? row[mapping.degree] : undefined,
    departmentName: mapping.department ? row[mapping.department] : undefined,
    graduationYear: mapping.graduationYear ? row[mapping.graduationYear] : undefined,
  }));
}

/** Alumni counterpart to toMappedStudentRows -- same bridging role, alumni column shape (see guessAlumniColumnMapping). */
export function toMappedAlumniRows(rows: Record<string, string>[], mapping: AlumniColumnMapping): MappedAlumniRow[] {
  return rows.map((row, index) => ({
    rowNumber: index + 2, // row 1 is the header in both CSV and XLSX
    name: mapping.name ? row[mapping.name] : undefined,
    email: mapping.email ? row[mapping.email] : undefined,
    company: mapping.company ? row[mapping.company] : undefined,
    degreeName: mapping.degree ? row[mapping.degree] : undefined,
    departmentName: mapping.department ? row[mapping.department] : undefined,
    graduationYear: mapping.graduationYear ? row[mapping.graduationYear] : undefined,
  }));
}
