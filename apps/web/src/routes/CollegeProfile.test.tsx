import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPatchMultipart } from "../lib/apiClient.js";
import { CollegeProfile } from "./CollegeProfile.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPatchMultipart: vi.fn() };
});

// Referenced directly (not wrapped in a new arrow function per call) so its
// identity stays stable across re-renders, matching the real SessionProvider
// (whose `can` is useCallback-memoized) -- CollegeProfile's fetch effect
// depends on `can`, so an unstable mock identity would re-fire it on every
// keystroke and wipe out in-progress form state.
let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can }),
}));

const baseProfile = {
  name: "BIET",
  slug: "biet",
  state: "Karnataka",
  city: "Mysuru",
  status: "provisioning",
  description: null,
  contactEmail: null,
  contactPhone: null,
  logoUrl: null,
  bannerUrl: null,
};

describe("CollegeProfile", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPatchMultipart).mockReset();
    can = () => true;
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<CollegeProfile />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("loads and displays the fetched profile", async () => {
    vi.mocked(apiGet).mockResolvedValue({ ...baseProfile, description: "A fine college." });
    render(<CollegeProfile />);

    expect(await screen.findByRole("heading", { name: "BIET" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("A fine college.")).toBeInTheDocument();
  });

  it("submits only the fields the user filled in, with no logo/banner keys", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    vi.mocked(apiPatchMultipart).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    render(<CollegeProfile />);

    await screen.findByRole("heading", { name: "BIET" });
    await user.type(screen.getByLabelText(/primary email address/i), "admin@example.com");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(apiPatchMultipart).toHaveBeenCalledTimes(1);
    const formData = vi.mocked(apiPatchMultipart).mock.calls[0][1] as FormData;
    expect(formData.get("contactEmail")).toBe("admin@example.com");
    expect(formData.get("logo")).toBeNull();
    expect(formData.get("banner")).toBeNull();
  });

  it("includes a selected logo file in the submitted form data", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseProfile);
    vi.mocked(apiPatchMultipart).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    render(<CollegeProfile />);

    await screen.findByRole("heading", { name: "BIET" });
    const file = new File(["logo-bytes"], "logo.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/^logo$/i), file);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const formData = vi.mocked(apiPatchMultipart).mock.calls[0][1] as FormData;
    expect(formData.get("logo")).toBe(file);
  });
});
