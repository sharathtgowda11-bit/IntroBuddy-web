import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../lib/apiClient.js";
import { AlumniDashboard } from "./AlumniDashboard.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
let role: string | undefined = "alumni";
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission), session: { role } }),
}));

const profile = {
  name: "Siri Alumna",
  email: "siri@example.com",
  avatarUrl: null,
  company: "Acme Corp",
  jobTitle: "Engineer",
  profileComplete: true,
};

const opportunities = [
  { id: "op-1", type: "job" as const, title: "SWE", description: null, company: "Acme", location: null, applyUrl: null, deadline: null, status: "open" as const },
  { id: "op-2", type: "internship" as const, title: "Intern", description: null, company: "Acme", location: null, applyUrl: null, deadline: null, status: "closed" as const },
];

const requests = [
  {
    id: "req-1",
    studentName: "Ananya Rao",
    studentEmail: "ananya@example.com",
    type: "mentorship" as const,
    opportunityTitle: null,
    message: "Could you mentor me?",
    status: "pending" as const,
    responseMessage: null,
    createdAt: "2026-01-01T10:00:00.000Z",
  },
  {
    id: "req-2",
    studentName: "Rahul Dev",
    studentEmail: "rahul@example.com",
    type: "referral" as const,
    opportunityTitle: "SWE",
    message: "Could you refer me?",
    status: "accepted" as const,
    responseMessage: "Sure!",
    createdAt: "2026-01-02T10:00:00.000Z",
  },
];

function mockLoad() {
  vi.mocked(apiGet).mockImplementation((path: string) => {
    if (path === "/me/profile") return Promise.resolve(profile);
    if (path === "/opportunities/mine") return Promise.resolve({ opportunities });
    if (path === "/requests/received") return Promise.resolve({ requests });
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <AlumniDashboard />
    </MemoryRouter>,
  );
}

describe("AlumniDashboard", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    can = () => true;
    role = "alumni";
  });

  it("shows summary tiles computed from the fetched requests/opportunities, not a full request list", async () => {
    mockLoad();
    renderDashboard();

    expect(await screen.findByText("Pending requests")).toBeInTheDocument();
    // Pending=1, Accepted=1, Active opportunities=1 (only op-1 is open).
    expect(screen.getAllByText("1")).toHaveLength(3);
    expect(screen.getByText("Total opportunities posted")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // total opportunities
    expect(screen.getByText("Active opportunities")).toBeInTheDocument();

    // No inline Accept/Decline actions on the dashboard anymore.
    expect(screen.queryByRole("button", { name: /^accept$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /respond/i })).not.toBeInTheDocument();
  });

  it("shows recent activity read-only, linking out to the dedicated requests page", async () => {
    mockLoad();
    renderDashboard();

    expect(await screen.findByText("Ananya Rao")).toBeInTheDocument();
    expect(screen.getByText("Rahul Dev")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all requests/i })).toHaveAttribute("href", "/alumni/requests");
  });
});
