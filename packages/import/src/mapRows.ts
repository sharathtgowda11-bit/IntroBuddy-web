import type { ColumnMapping } from "./guessColumnMapping.js";
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
    departmentName: mapping.department ? row[mapping.department] : undefined,
    graduationYear: mapping.graduationYear ? row[mapping.graduationYear] : undefined,
  }));
}
