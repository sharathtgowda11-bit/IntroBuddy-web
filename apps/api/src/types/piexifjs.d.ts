// piexifjs ships no types and no .d.ts of its own -- minimal ambient
// declaration covering only what this repo's tests actually use.
declare module "piexifjs" {
  export const GPSIFD: Record<string, number>;
  export const ImageIFD: Record<string, number>;
  export const ExifIFD: Record<string, number>;
  export function load(jpegData: string): Record<string, unknown>;
  export function dump(exifObj: Record<string, unknown>): string;
  export function insert(exifStr: string, jpegData: string): string;
  export function remove(jpegData: string): string;
}
