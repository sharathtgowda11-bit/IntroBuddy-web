import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPatch, apiPost } from "../lib/apiClient.js";
import { StudentManagement } from "./StudentManagement.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPatch: vi.fn(), apiPost: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

const student = {
  id: "student-1",
  name: "Jane Doe",
  usn: "1SM21CS001",
  email: "jane@example.com",
  status: "active" as const,
  graduationYear: 2026,
  degreeId: "degree-1",
  degreeName: "B.E.",
  departmentId: "dept-1",
  departmentName: "Computer Science and Engineering",
  profileComplete: false,
};

function mockApiGet() {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/departments") return { departments: [{ id: "dept-1", name: "Computer Science and Engineering" }] };
    if (path === "/students") return { students: [student], total: 1 };
    throw new Error(`unexpected path ${path}`);
  });
}

describe("StudentManagement", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiPost).mockReset();
    can = () => true;
    mockApiGet();
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<StudentManagement />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("loads and displays students", async () => {
    render(<StudentManagement />);

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("1SM21CS001")).toBeInTheDocument();
    expect(screen.getByText("1 total")).toBeInTheDocument();
  });

  it("edits a student's managed fields", async () => {
    vi.mocked(apiPatch).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    render(<StudentManagement />);

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const nameInput = screen.getByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Jane Updated");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/students/student-1", {
        name: "Jane Updated",
        usn: "1SM21CS001",
        departmentId: "dept-1",
        graduationYear: 2026,
      }),
    );
  });

  it("deactivates an active student", async () => {
    vi.mocked(apiPatch).mockResolvedValue({ status: "deactivated" });
    const user = userEvent.setup();
    render(<StudentManagement />);

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/students/student-1/status", { status: "deactivated" }));
  });

  it("triggers a password reset", async () => {
    vi.mocked(apiPost).mockResolvedValue({ status: "reset triggered" });
    const user = userEvent.setup();
    render(<StudentManagement />);

    await screen.findByText("Jane Doe");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/students/student-1/trigger-reset", {}));
    expect(await screen.findByText(/password reset email sent/i)).toBeInTheDocument();
  });
});
