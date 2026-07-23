import type { ImportFileKind } from "./parseFile.js";

/** Extension-based, not the client-supplied mimetype -- consistent, and shared by the upload route and the worker's commit job (which only ever has a stored file_path, no original request to trust a mimetype from). */
export function detectImportFileKind(filename: string): ImportFileKind | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "csv") return "csv";
  if (extension === "xlsx") return "xlsx";
  return null;
}
