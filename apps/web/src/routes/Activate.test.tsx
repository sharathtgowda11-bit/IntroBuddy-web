import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "../lib/apiClient.js";
import { Activate } from "./Activate.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiPost: vi.fn() };
});

function renderActivate(search = "?token=tenant-id.raw-token") {
  return render(
    <MemoryRouter initialEntries={[`/activate${search}`]}>
      <Activate />
    </MemoryRouter>,
  );
}

describe("Activate", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
  });

  it("shows an invalid-link message when the token is missing", () => {
    renderActivate("");
    expect(screen.getByText(/invalid link/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords without calling the API", async () => {
    const user = userEvent.setup();
    renderActivate();

    await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
    await user.type(screen.getByLabelText(/confirm password/i), "Different-Horse-9");
    await user.click(screen.getByLabelText(/agree to introbuddy/i));
    await user.click(screen.getByRole("button", { name: /activate account/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("requires consent before submitting", async () => {
    const user = userEvent.setup();
    renderActivate();

    await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
    await user.type(screen.getByLabelText(/confirm password/i), "Correct-Horse-9");
    await user.click(screen.getByRole("button", { name: /activate account/i }));

    expect(await screen.findByText(/must agree to the terms/i)).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("submits the token, password, and consent when everything is valid", async () => {
    vi.mocked(apiPost).mockResolvedValue({ status: "activated" });
    const user = userEvent.setup();
    renderActivate();

    await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
    await user.type(screen.getByLabelText(/confirm password/i), "Correct-Horse-9");
    await user.click(screen.getByLabelText(/agree to introbuddy/i));
    await user.click(screen.getByRole("button", { name: /activate account/i }));

    expect(apiPost).toHaveBeenCalledWith("/auth/activate", {
      token: "tenant-id.raw-token",
      password: "Correct-Horse-9",
      consentAccepted: true,
    });
  });
});
