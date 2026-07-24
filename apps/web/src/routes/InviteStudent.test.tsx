import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiPost } from "../lib/apiClient.js";
import { InviteStudent } from "./InviteStudent.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

describe("InviteStudent", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
    can = () => true;
    vi.mocked(apiGet).mockResolvedValue({ departments: [{ id: "dept-1", name: "Computer Science and Engineering" }] });
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<InviteStudent />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("submits an invitation for a student", async () => {
    vi.mocked(apiPost).mockResolvedValue({ status: "invited" });
    const user = userEvent.setup();
    render(<InviteStudent />);

    await user.type(screen.getByLabelText(/email/i), "student@example.com");
    await user.type(screen.getByLabelText(/usn/i), "1SM21CS001");
    await user.selectOptions(await screen.findByLabelText(/department/i), "dept-1");
    const yearInput = screen.getByLabelText(/graduation year/i);
    await user.clear(yearInput);
    await user.type(yearInput, "2027");
    await user.click(screen.getByRole("button", { name: /send invitation/i }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith("/invitations", {
        email: "student@example.com",
        role: "student",
        usn: "1SM21CS001",
        departmentId: "dept-1",
        graduationYear: 2027,
      }),
    );
    expect(await screen.findByText(/invitation sent/i)).toBeInTheDocument();
  });

  it("shows the backend's error on conflict", async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError("an active account already exists for this email", 409));
    const user = userEvent.setup();
    render(<InviteStudent />);

    await user.type(screen.getByLabelText(/email/i), "student@example.com");
    await user.type(screen.getByLabelText(/usn/i), "1SM21CS001");
    await user.selectOptions(await screen.findByLabelText(/department/i), "dept-1");
    await user.click(screen.getByRole("button", { name: /send invitation/i }));

    expect(await screen.findByText(/an active account already exists/i)).toBeInTheDocument();
  });
});
