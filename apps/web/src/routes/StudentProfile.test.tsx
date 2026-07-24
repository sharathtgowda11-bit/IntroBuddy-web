import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiDelete, apiGet, apiPatchMultipart, apiPost } from "../lib/apiClient.js";
import { StudentProfile } from "./StudentProfile.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPatchMultipart: vi.fn(), apiPost: vi.fn(), apiDelete: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

const baseProfile = {
  name: "Test Student",
  usn: "1SM21CS999",
  email: "student@example.com",
  graduationYear: 2026,
  degreeName: "B.E.",
  departmentName: "Computer Science and Engineering",
  avatarUrl: null,
  linkedinUrl: null,
  githubUrl: null,
  resumeUrl: null,
  bio: null,
  skills: null,
  interests: null,
  achievements: null,
  profileComplete: false,
  certifications: [],
};

describe("StudentProfile", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPatchMultipart).mockReset();
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiDelete).mockReset();
    can = () => true;
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<StudentProfile />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("loads and displays the profile", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    render(<StudentProfile />);

    expect(await screen.findByText(/1SM21CS999/)).toBeInTheDocument();
    expect(screen.getByText(/incomplete/i)).toBeInTheDocument();
    expect(screen.getByText(/no certifications yet/i)).toBeInTheDocument();
  });

  it("submits profile edits via multipart", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    vi.mocked(apiPatchMultipart).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    render(<StudentProfile />);

    await screen.findByText(/1SM21CS999/);
    await user.type(screen.getByLabelText(/linkedin url/i), "https://linkedin.com/in/test");
    await user.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() => expect(apiPatchMultipart).toHaveBeenCalledWith("/me/profile", expect.any(FormData)));
    expect(await screen.findByText(/profile updated/i)).toBeInTheDocument();
  });

  it("adds a certification", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    vi.mocked(apiPost).mockResolvedValue({ id: "cert-1", name: "AWS Basics", type: "course", issuingOrganisation: "AWS", date: null, certificateUrl: null });
    const user = userEvent.setup();
    render(<StudentProfile />);

    await screen.findByText(/1SM21CS999/);
    await user.type(screen.getByLabelText(/^name$/i), "AWS Basics");
    await user.type(screen.getByLabelText(/issuing organisation/i), "AWS");
    await user.click(screen.getByRole("button", { name: /add certification/i }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/me/certifications", {
        name: "AWS Basics",
        type: "workshop",
        issuingOrganisation: "AWS",
        date: undefined,
        certificateUrl: undefined,
      }),
    );
  });

  it("removes a certification", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      ...baseProfile,
      certifications: [{ id: "cert-1", name: "AWS Basics", type: "course", issuingOrganisation: "AWS", date: null, certificateUrl: null }],
    });
    vi.mocked(apiDelete).mockResolvedValue({ status: "deleted" });
    const user = userEvent.setup();
    render(<StudentProfile />);

    await screen.findByText("AWS Basics");
    await user.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(apiDelete).toHaveBeenCalledWith("/me/certifications/cert-1"));
  });
});
