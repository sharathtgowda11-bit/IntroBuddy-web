import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPatch, apiPost } from "../lib/apiClient.js";
import { AlumniManagement } from "./AlumniManagement.js";

function renderAlumniManagement() {
  return render(
    <MemoryRouter>
      <AlumniManagement />
    </MemoryRouter>,
  );
}

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPatch: vi.fn(), apiPost: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

const alumnus = {
  id: "alumnus-1",
  name: "Siri Alumna",
  email: "siri@example.com",
  status: "active" as const,
  graduationYear: 2020,
  degreeId: "degree-1",
  degreeName: "B.E.",
  departmentId: "dept-1",
  departmentName: "Computer Science and Engineering",
  company: "Acme Corp",
  profileComplete: true,
};

function mockApiGet() {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/departments") return { departments: [{ id: "dept-1", name: "Computer Science and Engineering" }] };
    if (path === "/alumni") return { alumni: [alumnus], total: 1 };
    throw new Error(`unexpected path ${path}`);
  });
}

describe("AlumniManagement", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiPost).mockReset();
    can = () => true;
    mockApiGet();
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    renderAlumniManagement();

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("links the Import Alumni button to the alumni import wizard", async () => {
    renderAlumniManagement();

    const importLink = await screen.findByRole("link", { name: /import alumni/i });
    expect(importLink).toHaveAttribute("href", "/college/import-alumni");
  });

  it("hides the Import Alumni button without alumni.import permission", async () => {
    const granted = new Set(["alumni.editManagedFields"]);
    can = (permission: string) => granted.has(permission);
    renderAlumniManagement();

    await screen.findByText("Siri Alumna");
    expect(screen.queryByRole("link", { name: /import alumni/i })).not.toBeInTheDocument();
  });

  it("loads and displays alumni, including their company and profile-completeness badge", async () => {
    renderAlumniManagement();

    expect(await screen.findByText("Siri Alumna")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("1 total")).toBeInTheDocument();
  });

  it("edits an alumnus's managed fields (no USN field, unlike students)", async () => {
    vi.mocked(apiPatch).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    renderAlumniManagement();

    await screen.findByText("Siri Alumna");
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.queryByLabelText(/usn/i)).not.toBeInTheDocument();

    const nameInput = screen.getByLabelText(/^name$/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Siri Updated");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() =>
      expect(apiPatch).toHaveBeenCalledWith("/alumni/alumnus-1", {
        name: "Siri Updated",
        departmentId: "dept-1",
        graduationYear: 2020,
      }),
    );
  });

  it("deactivates an active alumnus", async () => {
    vi.mocked(apiPatch).mockResolvedValue({ status: "deactivated" });
    const user = userEvent.setup();
    renderAlumniManagement();

    await screen.findByText("Siri Alumna");
    await user.click(screen.getByRole("button", { name: /deactivate/i }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/alumni/alumnus-1/status", { status: "deactivated" }));
  });

  it("triggers a password reset", async () => {
    vi.mocked(apiPost).mockResolvedValue({ status: "reset triggered" });
    const user = userEvent.setup();
    renderAlumniManagement();

    await screen.findByText("Siri Alumna");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/alumni/alumnus-1/trigger-reset", {}));
    expect(await screen.findByText(/password reset email sent/i)).toBeInTheDocument();
  });
});
