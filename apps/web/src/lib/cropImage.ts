export interface CroppedAreaPixels {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/**
 * Renders the user's crop selection (react-easy-crop's onCropComplete
 * pixel area, in *source-image* coordinates) onto a canvas sized to the
 * target output dimensions, rotated as chosen, and compresses the result
 * to JPEG. This is the only place canvas/Image APIs are touched -- kept
 * as a standalone, no-React function so component tests can mock it
 * instead of needing real image decoding, which jsdom doesn't support.
 *
 * Rotation is applied by drawing onto an intermediate canvas sized to fit
 * the full rotated source, then cropping *that* to the requested area --
 * matching react-easy-crop's own convention that croppedAreaPixels is
 * already expressed against the rotated image.
 */
export async function getCroppedImageFile(
  imageSrc: string,
  croppedAreaPixels: CroppedAreaPixels,
  rotation: number,
  outputWidth: number,
  outputHeight: number,
  fileName: string,
): Promise<File> {
  const image = await loadImage(imageSrc);
  const radians = (rotation * Math.PI) / 180;

  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const rotatedWidth = image.width * cos + image.height * sin;
  const rotatedHeight = image.width * sin + image.height * cos;

  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = rotatedWidth;
  rotatedCanvas.height = rotatedHeight;
  const rotatedCtx = rotatedCanvas.getContext("2d");
  if (!rotatedCtx) throw new Error("canvas 2d context unavailable");
  rotatedCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
  rotatedCtx.rotate(radians);
  rotatedCtx.drawImage(image, -image.width / 2, -image.height / 2);

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) throw new Error("canvas 2d context unavailable");
  outputCtx.drawImage(
    rotatedCanvas,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const blob = await new Promise<Blob | null>((resolve) => outputCanvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new Error("failed to encode cropped image");
  return new File([blob], fileName, { type: "image/jpeg" });
}
