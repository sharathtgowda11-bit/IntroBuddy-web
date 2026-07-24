import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../lib/apiClient.js";
import { AuditLog } from "./AuditLog.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

describe("AuditLog", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    can = () => true;
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    render(<AuditLog />);

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
  });

  it("loads and displays audit log entries", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      entries: [
        {
          id: "entry-1",
          actorCollegeUserId: "actor-1",
          action: "student.deactivate",
          targetType: "college_user",
          targetId: "student-1",
          ipAddress: "127.0.0.1",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    render(<AuditLog />);

    expect(await screen.findByText("student.deactivate")).toBeInTheDocument();
    expect(screen.getByText("college_user")).toBeInTheDocument();
    expect(screen.getByText("student-1")).toBeInTheDocument();
    expect(screen.getByText("actor-1")).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith("/audit-log", { limit: 50, offset: 0 });
  });
});
