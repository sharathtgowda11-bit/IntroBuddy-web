import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
}

export type ImportFileKind = "csv" | "xlsx";

/** Never assume a fixed template -- every college's file is different (spec 8.3, phase 2). Both formats normalize to the same plain-string-row shape. */
export async function parseImportFile(buffer: Buffer, kind: ImportFileKind): Promise<ParsedFile> {
  return kind === "csv" ? parseCsvBuffer(buffer) : parseXlsxBuffer(buffer);
}

function parseCsvBuffer(buffer: Buffer): ParsedFile {
  const records: Record<string, string>[] = parseCsv(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  return { headers, rows: records };
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { headers: [], rows: [] };
  }

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasAnyValue = false;
    headers.forEach((header, index) => {
      const cellValue = row.getCell(index + 1).value;
      const value = cellValue == null ? "" : String(cellValue).trim();
      if (value !== "") hasAnyValue = true;
      record[header] = value;
    });
    if (hasAnyValue) rows.push(record);
  });

  return { headers, rows };
}
