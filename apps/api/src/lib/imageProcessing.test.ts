import assert from "node:assert/strict";
import { test } from "node:test";
import exifr from "exifr";
import piexif from "piexifjs";
import sharp from "sharp";
import { stripExifAndNormalize } from "./imageProcessing.js";

/**
 * Builds a small JPEG with real GPS EXIF data baked in, entirely
 * in-memory -- fully reproducible, no binary photo fixture committed to
 * the repo. Verified empirically against this project's actual sharp
 * and piexifjs versions before writing this test.
 */
async function createImageWithGpsExif(): Promise<Buffer> {
  const baseJpeg = await sharp({
    create: { width: 40, height: 20, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg()
    .toBuffer();

  const exifObj = {
    "0th": {},
    Exif: {},
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: "N",
      [piexif.GPSIFD.GPSLatitude]: [
        [12, 1],
        [58, 1],
        [0, 1],
      ],
      [piexif.GPSIFD.GPSLongitudeRef]: "E",
      [piexif.GPSIFD.GPSLongitude]: [
        [77, 1],
        [35, 1],
        [0, 1],
      ],
    },
  };
  const exifBytes = piexif.dump(exifObj);
  const withExif = piexif.insert(exifBytes, baseJpeg.toString("binary"));
  return Buffer.from(withExif, "binary");
}

test("stripExifAndNormalize removes GPS/EXIF metadata (spec 14.1 #8)", async () => {
  const withGps = await createImageWithGpsExif();

  const beforeTags = await exifr.parse(withGps, { gps: true });
  assert.ok(beforeTags?.latitude, "fixture must genuinely carry GPS data before processing, or this test proves nothing");

  const processed = await stripExifAndNormalize(withGps);
  assert.equal(processed.contentType, "image/jpeg");
  assert.equal(processed.extension, "jpg");

  const afterTags = await exifr.parse(processed.buffer, { gps: true });
  assert.equal(afterTags, undefined);
});

test("stripExifAndNormalize downsizes images larger than the max dimension", async () => {
  const oversized = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .jpeg()
    .toBuffer();

  const processed = await stripExifAndNormalize(oversized);
  const metadata = await sharp(processed.buffer).metadata();
  assert.ok(metadata.width && metadata.width <= 1600);
});
