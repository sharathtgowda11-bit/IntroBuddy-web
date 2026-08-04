import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCroppedImageFile } from "../lib/cropImage.js";
import { ImageCropDialog } from "./ImageCropDialog.js";

vi.mock("../lib/cropImage.js", () => ({
  getCroppedImageFile: vi.fn(),
}));

// react-easy-crop's real Cropper needs actual image decoding, which jsdom
// doesn't support -- this stub renders a placeholder and reports a fixed
// crop area as soon as it "loads", exactly like the real one does once its
// image finishes decoding. This file tests ImageCropDialog's own wiring
// (zoom/rotation state, cancel, confirm), not react-easy-crop's internals.
function MockCropper({ onCropComplete }: { onCropComplete?: (area: unknown, pixels: unknown) => void }) {
  useEffect(() => {
    onCropComplete?.({ x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 });
  }, [onCropComplete]);
  return <div data-testid="mock-cropper" />;
}
vi.mock("react-easy-crop", () => ({ default: MockCropper }));

const FILE = new File(["raw-bytes"], "photo.png", { type: "image/png" });
const CROPPED_FILE = new File(["cropped-bytes"], "photo.png", { type: "image/jpeg" });

describe("ImageCropDialog", () => {
  beforeEach(() => {
    vi.mocked(getCroppedImageFile).mockReset();
    vi.mocked(getCroppedImageFile).mockResolvedValue(CROPPED_FILE);
  });

  it("renders nothing when closed", () => {
    render(
      <ImageCropDialog open={false} file={null} aspect={1} outputWidth={512} outputHeight={512} onCancel={vi.fn()} onCropped={vi.fn()} />,
    );

    expect(screen.queryByText(/adjust your photo/i)).not.toBeInTheDocument();
  });

  it("shows the cropper and calls onCancel without processing the image when cancelled", async () => {
    const onCancel = vi.fn();
    const onCropped = vi.fn();
    const user = userEvent.setup();
    render(
      <ImageCropDialog open={true} file={FILE} aspect={1} outputWidth={512} outputHeight={512} onCancel={onCancel} onCropped={onCropped} />,
    );

    expect(screen.getByText(/adjust your photo/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(getCroppedImageFile).not.toHaveBeenCalled();
    expect(onCropped).not.toHaveBeenCalled();
  });

  it("crops via the shared utility and hands back its result on confirm", async () => {
    const onCropped = vi.fn();
    const user = userEvent.setup();
    render(
      <ImageCropDialog open={true} file={FILE} aspect={1} outputWidth={512} outputHeight={512} onCancel={vi.fn()} onCropped={onCropped} />,
    );

    const confirmButton = await screen.findByRole("button", { name: /use this photo/i });
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
    await user.click(confirmButton);

    await waitFor(() => expect(onCropped).toHaveBeenCalledWith(CROPPED_FILE));
    expect(getCroppedImageFile).toHaveBeenCalledWith(
      expect.stringMatching(/^blob:/),
      { x: 0, y: 0, width: 100, height: 100 },
      0,
      512,
      512,
      "photo.png",
    );
  });
});
