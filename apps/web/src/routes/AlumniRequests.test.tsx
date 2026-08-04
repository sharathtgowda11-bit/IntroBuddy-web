import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPatch } from "../lib/apiClient.js";
import { AlumniRequests } from "./AlumniRequests.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPatch: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
let role: string | undefined = "alumni";
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission), session: { role } }),
}));

function req(overrides: {
  id?: string;
  studentName?: string | null;
  type?: "mentorship" | "referral";
  opportunityTitle?: string | null;
  message?: string;
  status?: "pending" | "accepted" | "declined" | "expired" | "withdrawn";
  responseMessage?: string | null;
  createdAt?: string;
} = {}) {
  return {
    id: overrides.id ?? "req-1",
    studentName: overrides.studentName ?? "Ananya Rao",
    studentEmail: "ananya@example.com",
    type: overrides.type ?? "mentorship",
    opportunityTitle: overrides.opportunityTitle ?? null,
    message: overrides.message ?? "Could you mentor me?",
    status: overrides.status ?? "pending",
    responseMessage: overrides.responseMessage ?? null,
    createdAt: overrides.createdAt ?? "2026-01-01T10:00:00.000Z",
  };
}

describe("AlumniRequests", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPatch).mockReset();
    can = () => true;
    role = "alumni";
  });

  it("renders an access-denied message when the caller lacks permission or role", () => {
    can = () => false;
    render(<AlumniRequests />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });

  it("shows live status-tab counts and filters the list when a tab is clicked", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      requests: [
        req({ id: "1", status: "pending" }),
        req({ id: "2", status: "pending", studentName: "Rahul Dev" }),
        req({ id: "3", status: "accepted", studentName: "Priya Nair" }),
        req({ id: "4", status: "declined", studentName: "Kiran Shah" }),
      ],
    });
    const user = userEvent.setup();
    render(<AlumniRequests />);

    expect(await screen.findByRole("button", { name: /pending \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /accepted \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /declined \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all \(4\)/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /accepted \(1\)/i }));
    expect(screen.getByText("Priya Nair")).toBeInTheDocument();
    expect(screen.queryByText("Rahul Dev")).not.toBeInTheDocument();
  });

  it("filters by request type", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      requests: [
        req({ id: "1", type: "mentorship", studentName: "Mentor Seeker" }),
        req({ id: "2", type: "referral", studentName: "Referral Seeker", opportunityTitle: "SWE Intern" }),
      ],
    });
    const user = userEvent.setup();
    render(<AlumniRequests />);

    await screen.findByText("Mentor Seeker");
    await user.selectOptions(screen.getByLabelText(/type/i), "referral");

    expect(screen.queryByText("Mentor Seeker")).not.toBeInTheDocument();
    expect(screen.getByText("Referral Seeker")).toBeInTheDocument();
  });

  it("searches by student name", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      requests: [req({ id: "1", studentName: "Ananya Rao" }), req({ id: "2", studentName: "Rahul Dev" })],
    });
    const user = userEvent.setup();
    render(<AlumniRequests />);

    await screen.findByText("Ananya Rao");
    await user.type(screen.getByLabelText(/search by student name/i), "rahul");

    expect(screen.queryByText("Ananya Rao")).not.toBeInTheDocument();
    expect(screen.getByText("Rahul Dev")).toBeInTheDocument();
  });

  it("sorts oldest-first when selected", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      requests: [
        req({ id: "1", studentName: "Newer Student", createdAt: "2026-02-01T00:00:00.000Z" }),
        req({ id: "2", studentName: "Older Student", createdAt: "2026-01-01T00:00:00.000Z" }),
      ],
    });
    const user = userEvent.setup();
    render(<AlumniRequests />);

    await screen.findByText("Newer Student");
    await user.selectOptions(screen.getByLabelText(/sort by/i), "oldest");

    const names = screen.getAllByText(/Student$/).map((el) => el.textContent);
    expect(names).toEqual(["Older Student", "Newer Student"]);
  });

  it("paginates past 10 results with Previous/Next", async () => {
    const many = Array.from({ length: 12 }, (_, i) => req({ id: `req-${i}`, studentName: `Student ${i}` }));
    vi.mocked(apiGet).mockResolvedValue({ requests: many });
    const user = userEvent.setup();
    render(<AlumniRequests />);

    await screen.findByText("Student 0");
    expect(screen.queryByText("Student 10")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByText("Student 10")).toBeInTheDocument();
    expect(screen.queryByText("Student 0")).not.toBeInTheDocument();
  });

  it("accepts a pending request and refetches", async () => {
    const pending = req({ id: "1", status: "pending" });
    vi.mocked(apiGet).mockResolvedValue({ requests: [pending] });
    vi.mocked(apiPatch).mockResolvedValue({ status: "accepted" });
    const user = userEvent.setup();
    render(<AlumniRequests />);

    await screen.findByText("Ananya Rao");
    await user.click(screen.getByRole("button", { name: /respond/i }));
    await user.click(screen.getByRole("button", { name: /^accept$/i }));

    expect(apiPatch).toHaveBeenCalledWith("/requests/1/respond", { status: "accepted", responseMessage: undefined });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});
