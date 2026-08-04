import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPatchMultipart } from "../lib/apiClient.js";
import { AlumniProfileWizard } from "./AlumniProfileWizard.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPatchMultipart: vi.fn() };
});

// See CollegeProfile.test.tsx's identical note: the real dialog needs
// image decoding jsdom doesn't support, so pages get a stub that fires
// onCropped as soon as they open the dialog.
vi.mock("../components/ImageCropDialog.js", () => ({
  ImageCropDialog: ({ open, onCropped }: { open: boolean; onCropped: (file: File) => void }) => {
    useEffect(() => {
      if (open) onCropped(new File(["cropped"], "cropped.jpg", { type: "image/jpeg" }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    return null;
  },
}));

// Stable identity across re-renders, matching the real SessionProvider
// (whose `can` is useCallback-memoized) -- see CollegeProfile.test.tsx's
// identical note.
let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can }),
}));

const baseProfile = {
  name: "Siri Alumna",
  email: "siri@example.com",
  collegeName: "BIET",
  degreeName: "B.E.",
  departmentName: "Computer Science and Engineering",
  graduationYear: 2020,
  avatarUrl: null,
  bio: null,
  phone: null,
  linkedinUrl: null,
  githubUrl: null,
  company: null,
  jobTitle: null,
  skills: null,
  country: null,
  city: null,
  yearsOfExperience: null,
  workEmail: null,
  mentorshipAvailable: true,
  profileComplete: false,
};

describe("AlumniProfileWizard", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPatchMultipart).mockReset();
    can = () => true;
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<AlumniProfileWizard />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("loads the profile and shows the read-only graduation block on Step 2", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    const user = userEvent.setup();
    render(<AlumniProfileWizard />);

    expect(await screen.findByText("siri@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /2\. graduation details/i }));

    expect(screen.getByText("BIET")).toBeInTheDocument();
    expect(screen.getByText("B.E.")).toBeInTheDocument();
    expect(screen.getByText("Computer Science and Engineering")).toBeInTheDocument();
    expect(screen.getByText("2020")).toBeInTheDocument();
    // Read-only -- no input for any of these fields anywhere on the step.
    expect(screen.queryByRole("textbox", { name: /degree/i })).not.toBeInTheDocument();
  });

  it("submits only Step 1's fields, without touching Step 3's professional fields", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    vi.mocked(apiPatchMultipart).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    render(<AlumniProfileWizard />);

    await screen.findByText("siri@example.com");
    await user.type(screen.getByLabelText(/bio/i), "A short bio");
    await user.type(screen.getByLabelText(/linkedin url/i), "https://linkedin.com/in/example");
    await user.click(screen.getByRole("button", { name: /save & continue/i }));

    expect(apiPatchMultipart).toHaveBeenCalledTimes(1);
    const [path, formData] = vi.mocked(apiPatchMultipart).mock.calls[0] as [string, FormData];
    expect(path).toBe("/me/profile");
    expect(formData.get("bio")).toBe("A short bio");
    expect(formData.get("linkedinUrl")).toBe("https://linkedin.com/in/example");
    expect(formData.get("company")).toBeNull();
    expect(formData.get("skills")).toBeNull();
    // Unlike the optional text fields above, mentorshipAvailable is always
    // sent -- a toggle has no "leave unset" state.
    expect(formData.get("mentorshipAvailable")).toBe("true");
  });

  it("routes a picked photo through the crop dialog before including it in the submitted form data", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    vi.mocked(apiPatchMultipart).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    render(<AlumniProfileWizard />);

    await screen.findByText("siri@example.com");
    const file = new File(["photo-bytes"], "photo.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/^photo$/i), file);
    await user.click(screen.getByRole("button", { name: /save & continue/i }));

    expect(apiPatchMultipart).toHaveBeenCalledTimes(1);
    const [, formData] = vi.mocked(apiPatchMultipart).mock.calls[0] as [string, FormData];
    const submittedAvatar = formData.get("avatar") as File;
    expect(submittedAvatar).toBeInstanceOf(File);
    expect(submittedAvatar.type).toBe("image/jpeg");
  });

  it("toggles mentorship availability and sends the updated value on save", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    vi.mocked(apiPatchMultipart).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    render(<AlumniProfileWizard />);

    await screen.findByText("siri@example.com");
    expect(screen.getByText(/✅ Available for Mentorship/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/❌ Not Available for Mentorship/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save & continue/i }));

    const [, formData] = vi.mocked(apiPatchMultipart).mock.calls[0] as [string, FormData];
    expect(formData.get("mentorshipAvailable")).toBe("false");
  });
});
