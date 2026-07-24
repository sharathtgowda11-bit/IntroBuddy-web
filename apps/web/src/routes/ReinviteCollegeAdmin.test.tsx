import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiPost } from "../lib/apiClient.js";
import { ReinviteCollegeAdmin } from "./ReinviteCollegeAdmin.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiPost: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

describe("ReinviteCollegeAdmin", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    can = () => true;
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<ReinviteCollegeAdmin />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("resends the activation email for the given tenant", async () => {
    vi.mocked(apiPost).mockResolvedValue({ status: "reinvited" });
    const user = userEvent.setup();
    render(<ReinviteCollegeAdmin />);

    await user.type(screen.getByLabelText(/tenant id/i), "tenant-123");
    await user.click(screen.getByRole("button", { name: /resend activation/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/colleges/tenant-123/reinvite-admin", {}));
    expect(await screen.findByText(/new activation email has been sent/i)).toBeInTheDocument();
  });

  it("shows the backend's error when the admin is already active", async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError("college admin is already active", 409));
    const user = userEvent.setup();
    render(<ReinviteCollegeAdmin />);

    await user.type(screen.getByLabelText(/tenant id/i), "tenant-123");
    await user.click(screen.getByRole("button", { name: /resend activation/i }));

    expect(await screen.findByText(/already active/i)).toBeInTheDocument();
  });
});
