import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../lib/apiClient.js";
import { DegreeManagement } from "./DegreeManagement.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

function mockApiGet() {
  vi.mocked(apiGet).mockImplementation(async (path: string) => {
    if (path === "/degrees") return { degrees: [{ id: "degree-1", name: "B.E." }] };
    if (path === "/departments") return { departments: [{ id: "dept-1", degreeId: "degree-1", name: "Computer Science" }] };
    throw new Error(`unexpected path ${path}`);
  });
}

describe("DegreeManagement", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiDelete).mockReset();
    can = () => true;
    mockApiGet();
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<DegreeManagement />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("loads and displays degrees with their departments", async () => {
    render(<DegreeManagement />);

    expect(await screen.findByText("B.E.")).toBeInTheDocument();
    expect(screen.getByText("Computer Science")).toBeInTheDocument();
  });

  it("adds a new degree", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: "degree-2", name: "M.Tech" });
    const user = userEvent.setup();
    render(<DegreeManagement />);

    await screen.findByText("B.E.");
    await user.type(screen.getByLabelText(/new degree/i), "M.Tech");
    await user.click(screen.getByRole("button", { name: /add degree/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/degrees", { name: "M.Tech" }));
  });

  it("adds a new department under a degree", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: "dept-2", degreeId: "degree-1", name: "Mechanical" });
    const user = userEvent.setup();
    render(<DegreeManagement />);

    await screen.findByText("B.E.");
    await user.type(screen.getByLabelText(/new department/i), "Mechanical");
    await user.click(screen.getByRole("button", { name: /add department/i }));

    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/departments", { degreeId: "degree-1", name: "Mechanical" }));
  });

  it("renames a degree", async () => {
    vi.mocked(apiPatch).mockResolvedValue({ status: "updated" });
    const user = userEvent.setup();
    render(<DegreeManagement />);

    await screen.findByText("B.E.");
    await user.click(screen.getAllByRole("button", { name: /^rename$/i })[0]);
    const input = screen.getByDisplayValue("B.E.");
    await user.clear(input);
    await user.type(input, "B.Tech");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith("/degrees/degree-1", { name: "B.Tech" }));
  });

  it("shows an error when deleting a degree with attached departments", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new ApiError("cannot delete a degree with departments still attached", 409));
    const user = userEvent.setup();
    render(<DegreeManagement />);

    await screen.findByText("B.E.");
    await user.click(screen.getAllByRole("button", { name: /^delete$/i })[0]);

    expect(await screen.findByText(/cannot delete a degree with departments still attached/i)).toBeInTheDocument();
  });
});
