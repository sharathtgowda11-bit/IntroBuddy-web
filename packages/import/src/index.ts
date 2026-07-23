export { parseImportFile, type ImportFileKind, type ParsedFile } from "./parseFile.js";
export { detectImportFileKind } from "./fileKind.js";
export { guessColumnMapping, type ColumnMapping, type TargetField } from "./guessColumnMapping.js";
export { toMappedStudentRows } from "./mapRows.js";
export {
  validateImportRows,
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
export { errorsToCsv, type ImportErrorRow } from "./toCsv.js";
