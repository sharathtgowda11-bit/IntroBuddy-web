import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../lib/apiClient.js";
import { PlatformDashboard } from "./PlatformDashboard.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

const colleges = [
  {
    id: "college-1",
    slug: "biet",
    name: "BIET",
    status: "active" as const,
    city: "Davangere",
    state: "Karnataka",
    totalStudents: 500,
    activeStudents: 120,
  },
  {
    id: "college-2",
    slug: "gmit",
    name: "GMIT",
    status: "provisioning" as const,
    city: "Davangere",
    state: "Karnataka",
    totalStudents: 0,
    activeStudents: 0,
  },
];

describe("PlatformDashboard", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    can = () => true;
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<PlatformDashboard />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("loads and displays platform-wide college stats and the college table", async () => {
    vi.mocked(apiGet).mockResolvedValue({ colleges });
    render(<PlatformDashboard />);

    expect(await screen.findByText("BIET")).toBeInTheDocument();
    expect(screen.getByText("GMIT")).toBeInTheDocument();
    // Tiles: 2 total, 1 active, 1 provisioning.
    expect(screen.getByText("Total colleges onboarded").nextSibling?.textContent).toBe("2");
    expect(screen.getByText("Active colleges").nextSibling?.textContent).toBe("1");
    expect(screen.getByText("Colleges in provisioning").nextSibling?.textContent).toBe("1");
    expect(apiGet).toHaveBeenCalledWith("/colleges");
  });

  it("filters the table by search text", async () => {
    vi.mocked(apiGet).mockResolvedValue({ colleges });
    const user = userEvent.setup();
    render(<PlatformDashboard />);

    await screen.findByText("BIET");
    await user.type(screen.getByPlaceholderText(/search by name or college id/i), "gmit");

    expect(screen.getByText("GMIT")).toBeInTheDocument();
    expect(screen.queryByText("BIET")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 2")).toBeInTheDocument();
  });

  it("filters the table by status", async () => {
    vi.mocked(apiGet).mockResolvedValue({ colleges });
    const user = userEvent.setup();
    render(<PlatformDashboard />);

    await screen.findByText("BIET");
    await user.selectOptions(screen.getByRole("combobox"), "provisioning");

    expect(screen.getByText("GMIT")).toBeInTheDocument();
    expect(screen.queryByText("BIET")).not.toBeInTheDocument();
  });
});
