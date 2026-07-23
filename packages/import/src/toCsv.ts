import { stringify } from "csv-stringify/sync";

export interface ImportErrorRow {
  rowNumber: number;
  rawRow: Record<string, string>;
  errorReason: string;
}

/**
 * Produces the downloadable error-report CSV (spec 8.3, phase 4): the
 * original row data plus an added error_reason column, so the admin
 * corrects their source file rather than deciphering a web page.
 * Generated fresh from import_errors on every download -- never
 * pre-generated and stored, so it always reflects the latest pass.
 */
export function errorsToCsv(errors: ImportErrorRow[]): string {
  if (errors.length === 0) {
    return stringify([], { header: true, columns: ["row_number", "error_reason"] });
  }

  const rawColumnNames = Object.keys(errors[0].rawRow);
  const columns = ["row_number", ...rawColumnNames, "error_reason"];

  const records = errors.map((error) => ({
    row_number: error.rowNumber,
    ...error.rawRow,
    error_reason: error.errorReason,
  }));

  return stringify(records, { header: true, columns });
}
