import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPatch, apiPost, apiPostMultipart, ApiError } from "../lib/apiClient.js";
import { ImportWizard } from "./ImportWizard.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiPostMultipart: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can }),
}));

function renderWizard(initialPath = "/college/import") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/college/import" element={<ImportWizard />} />
        <Route path="/college/import/:jobId" element={<ImportWizard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ImportWizard", () => {
  beforeEach(() => {
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiPost).mockReset();
    vi.mocked(apiPatch).mockReset();
    vi.mocked(apiPostMultipart).mockReset();
    can = () => true;
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    renderWizard();

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    expect(apiPostMultipart).not.toHaveBeenCalled();
  });

  it("walks upload -> mapping -> validate -> commit -> poll -> committed", async () => {
    const user = userEvent.setup();

    vi.mocked(apiPostMultipart).mockResolvedValue({
      id: "job-1",
      phase: "uploaded",
      columnMapping: { email: "Email" },
      headers: ["Name", "Email", "USN"],
      rowCount: 5,
      validCount: null,
      invalidCount: null,
      createCount: null,
      updateCount: null,
      committedRowCount: null,
      errorMessage: null,
    });
    renderWizard();

    const file = new File(["a,b\n1,2"], "students.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText(/roster file/i), file);
    await user.click(screen.getByRole("button", { name: /^upload$/i }));

    expect(await screen.findByText(/map columns/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("Email");

    vi.mocked(apiPatch).mockResolvedValue({ status: "mapped" });
    vi.mocked(apiGet).mockResolvedValueOnce({
      id: "job-1",
      phase: "mapped",
      columnMapping: { email: "Email" },
      rowCount: 5,
      validCount: null,
      invalidCount: null,
      createCount: null,
      updateCount: null,
      committedRowCount: null,
      errorMessage: null,
    });
    await user.click(screen.getByRole("button", { name: /confirm mapping/i }));

    expect(await screen.findByText(/run validation/i)).toBeInTheDocument();
    expect(apiPatch).toHaveBeenCalledWith("/import-jobs/job-1/mapping", { columnMapping: { email: "Email" } });

    vi.mocked(apiPost).mockResolvedValueOnce({
      phase: "validated",
      rowCount: 5,
      validCount: 3,
      invalidCount: 2,
      createCount: 2,
      updateCount: 1,
    });
    await user.click(screen.getByRole("button", { name: /run validation/i }));

    expect(await screen.findByText(/valid: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/invalid: 2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download errors csv/i })).toBeInTheDocument();

    // The commit-phase poller reads this once its 2.5s interval fires.
    vi.mocked(apiGet).mockResolvedValue({
      id: "job-1",
      phase: "committed",
      columnMapping: { email: "Email" },
      rowCount: 5,
      validCount: 3,
      invalidCount: 2,
      createCount: 2,
      updateCount: 1,
      committedRowCount: 3,
      errorMessage: null,
    });
    vi.mocked(apiPost).mockResolvedValueOnce({ status: "queued" });
    await user.click(screen.getByRole("button", { name: /^commit$/i }));

    expect(await screen.findByText(/creating student accounts/i)).toBeInTheDocument();

    // Real 2.5s poll interval -- allow more than that for the transition.
    expect(await screen.findByText(/accounts created/i, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/3 student accounts/i)).toBeInTheDocument();
  });

  it("shows a retry affordance when send-invitations reports a drifted count", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      id: "job-2",
      phase: "committed",
      columnMapping: {},
      rowCount: 5,
      validCount: 5,
      invalidCount: 0,
      createCount: 5,
      updateCount: 0,
      committedRowCount: 5,
      errorMessage: null,
    });
    const user = userEvent.setup();
    renderWizard("/college/import/job-2");

    expect(await screen.findByText(/accounts created/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /download errors csv/i })).not.toBeInTheDocument();

    vi.mocked(apiPost).mockRejectedValue(
      new ApiError("recipient count has changed since you last checked -- please refresh and confirm again", 409, {
        actualCount: 4,
      }),
    );
    await user.click(screen.getByRole("button", { name: /send invitations/i }));

    expect(await screen.findByRole("button", { name: /retry with 4/i })).toBeInTheDocument();
  });
});
