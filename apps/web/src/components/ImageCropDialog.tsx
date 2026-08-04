import { useEffect, useMemo, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { getCroppedImageFile } from "../lib/cropImage.js";
import { Button } from "./ui/button.js";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog.js";

export interface ImageCropDialogProps {
  open: boolean;
  /** The raw file the user just picked -- the dialog owns turning it into an object URL. */
  file: File | null;
  /** e.g. 1 for a square photo/logo, 1600/500 for the college banner. */
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  onCancel: () => void;
  /** Called with the cropped, compressed, aspect-correct File -- same shape every existing upload handler already expects. */
  onCropped: (file: File) => void;
}

/**
 * Shared crop/zoom/reposition/rotate step, reused by every image upload in
 * the app (college logo, college banner, student avatar, alumni avatar).
 * Owns only the interactive crop UI and handing back a File in the right
 * shape -- callers still run their existing preview/FormData/submit logic
 * on the result exactly as they did on the raw picked file before.
 */
export function ImageCropDialog({ open, file, aspect, outputWidth, outputHeight, onCancel, onCropped }: ImageCropDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One object URL per file, revoked whenever the file changes or the
  // dialog unmounts -- not recreated on every render, which would leak a
  // blob URL each time and needlessly re-decode the image in the cropper.
  const imageSrc = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setCroppedAreaPixels(null);
    setError(null);
  }

  function handleCancel() {
    reset();
    onCancel();
  }

  async function handleConfirm() {
    if (!file || !imageSrc || !croppedAreaPixels) return;
    setIsProcessing(true);
    setError(null);
    try {
      const cropped = await getCroppedImageFile(imageSrc, croppedAreaPixels, rotation, outputWidth, outputHeight, file.name);
      reset();
      onCropped(cropped);
    } catch {
      setError("Could not process that image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleCancel()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Adjust your photo</DialogTitle>
        </DialogHeader>

        {imageSrc && (
          <div className="relative h-80 w-full overflow-hidden rounded-md bg-muted">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_croppedArea, pixels) => setCroppedAreaPixels(pixels)}
            />
          </div>
        )}

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 font-medium text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 font-medium text-muted-foreground">Rotate</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="w-full"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button type="button" variant="brand" onClick={handleConfirm} disabled={isProcessing || !croppedAreaPixels}>
            {isProcessing ? "Processing…" : "Use this photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
