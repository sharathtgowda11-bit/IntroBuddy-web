/** Normalizes a name into a URL-safe slug fragment. Callers append their own uniqueness suffix where collisions matter. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
