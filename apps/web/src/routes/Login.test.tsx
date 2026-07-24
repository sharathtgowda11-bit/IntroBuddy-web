import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiPost } from "../lib/apiClient.js";
import { Login } from "./Login.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiPost: vi.fn() };
});

const loginWithToken = vi.fn();
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ loginWithToken }),
}));

describe("Login", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    loginWithToken.mockReset();
  });

  it("submits credentials and stores the returned session token", async () => {
    vi.mocked(apiPost).mockResolvedValue({ token: "tenant-id.raw-token" });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/college id/i), "rvce");
    await user.type(screen.getByLabelText(/email or usn/i), "1rv20cs001");
    await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(apiPost).toHaveBeenCalledWith("/auth/login", {
      tenantSlug: "rvce",
      emailOrUsn: "1rv20cs001",
      password: "Correct-Horse-9",
    });
    expect(await screen.findByRole("button", { name: /sign in/i })).toBeEnabled();
    expect(loginWithToken).toHaveBeenCalledWith("tenant-id.raw-token");
  });

  it("shows the backend's error message on failed login", async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError("invalid credentials", 401));
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/college id/i), "rvce");
    await user.type(screen.getByLabelText(/email or usn/i), "1rv20cs001");
    await user.type(screen.getByLabelText(/^password$/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("invalid credentials")).toBeInTheDocument();
    expect(loginWithToken).not.toHaveBeenCalled();
  });
});
