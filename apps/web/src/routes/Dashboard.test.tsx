import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../lib/apiClient.js";
import { Dashboard } from "./Dashboard.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
let role: string = "college_admin";
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission), session: { role } }),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    can = () => true;
    role = "college_admin";
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<Dashboard />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("renders an access-denied message for super_admin (has DASHBOARD_VIEW but not this dashboard)", () => {
    role = "super_admin";
    render(<Dashboard />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("loads and displays dashboard stats", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      totalStudents: 42,
      activeCount: 30,
      invitedCount: 10,
      deactivatedCount: 2,
      profileCompleteCount: 15,
      totalAlumni: 8,
      activeAlumniCount: 5,
      invitedAlumniCount: 3,
      deactivatedAlumniCount: 0,
      alumniProfileCompleteCount: 4,
      alumniByCompany: [{ company: "Acme Corp", count: 3 }],
    });
    render(<Dashboard />);

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/dashboard");
  });

  it("shows an empty state when no alumni have added a company yet", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      totalStudents: 0,
      activeCount: 0,
      invitedCount: 0,
      deactivatedCount: 0,
      profileCompleteCount: 0,
      totalAlumni: 0,
      activeAlumniCount: 0,
      invitedAlumniCount: 0,
      deactivatedAlumniCount: 0,
      alumniProfileCompleteCount: 0,
      alumniByCompany: [],
    });
    render(<Dashboard />);

    expect(await screen.findByText(/no alumni have added a company yet/i)).toBeInTheDocument();
  });
});
