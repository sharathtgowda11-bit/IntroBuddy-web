export { parseImportFile, type ImportFileKind, type ParsedFile } from "./parseFile.js";
export { detectImportFileKind } from "./fileKind.js";
export {
  guessColumnMapping,
  guessAlumniColumnMapping,
  type ColumnMapping,
  type TargetField,
  type AlumniColumnMapping,
  type AlumniTargetField,
} from "./guessColumnMapping.js";
export { toMappedStudentRows, toMappedAlumniRows } from "./mapRows.js";
export {
  validateImportRows,
  resolveDepartmentMatch,
  getGraduationYearBounds,
  GRADUATION_YEAR_PAST_OFFSET,
  GRADUATION_YEAR_FUTURE_OFFSET,
  type ValidationContext,
  type DepartmentMatch,
  type MappedStudentRow,
  type RowOutcome,
  type ValidRowOutcome,
  type RejectedRowOutcome,
} from "./validateRows.js";
export {
  validateAlumniRows,
  type AlumniValidationContext,
  type MappedAlumniRow,
  type AlumniRowOutcome,
  type ValidAlumniRowOutcome,
} from "./validateAlumniRows.js";
export { errorsToCsv, type ImportErrorRow } from "./toCsv.js";
