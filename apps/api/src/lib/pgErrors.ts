/** Postgres error code 23503 = foreign_key_violation. */
export function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "23503";
}
