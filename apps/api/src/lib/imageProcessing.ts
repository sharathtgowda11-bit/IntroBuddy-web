import sharp from "sharp";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 85;

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  extension: string;
}

/**
 * Strips all metadata (EXIF, GPS, everything) and normalizes to JPEG,
 * regardless of input format. Spec 14.1 #8: EXIF stripped from every
 * uploaded image without exception -- sharp strips all metadata by
 * default unless .withMetadata() is called, so never calling that
 * method anywhere in this pipeline *is* the guarantee. Bare .rotate()
 * applies the EXIF orientation tag to the actual pixels before that tag
 * (and GPS data) is dropped, so images don't visually rotate sideways as
 * a side effect of stripping.
 */
export async function stripExifAndNormalize(input: Buffer): Promise<ProcessedImage> {
  const buffer = await sharp(input)
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return { buffer, contentType: "image/jpeg", extension: "jpg" };
}
