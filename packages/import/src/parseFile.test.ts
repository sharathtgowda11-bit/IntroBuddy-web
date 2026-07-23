import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { parseImportFile } from "./parseFile.js";

test("parses a CSV buffer into headers and rows", async () => {
  const csv = "Name,USN,Email\nJohn Doe,1RV20CS001,john@example.com\nJane Smith,1RV20CS002,jane@example.com\n";
  const { headers, rows } = await parseImportFile(Buffer.from(csv), "csv");

  assert.deepEqual(headers, ["Name", "USN", "Email"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Name, "John Doe");
  assert.equal(rows[1].USN, "1RV20CS002");
});

test("parses an XLSX buffer into headers and rows, skipping the header row and blank rows", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students");
  worksheet.addRow(["Name", "USN", "Email"]);
  worksheet.addRow(["John Doe", "1RV20CS001", "john@example.com"]);
  worksheet.addRow([]); // a genuinely blank row, e.g. from a trailing spreadsheet artifact
  worksheet.addRow(["Jane Smith", "1RV20CS002", "jane@example.com"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const { headers, rows } = await parseImportFile(buffer, "xlsx");

  assert.deepEqual(headers, ["Name", "USN", "Email"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Name, "John Doe");
  assert.equal(rows[1].USN, "1RV20CS002");
});
