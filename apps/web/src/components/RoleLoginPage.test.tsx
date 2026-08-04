import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLoginPortal } from "../lib/loginPortals.js";
import { apiPost, ApiError } from "../lib/apiClient.js";
import { RoleLoginPage } from "./RoleLoginPage.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiPost: vi.fn() };
});

const loginWithToken = vi.fn();
const logout = vi.fn();
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ loginWithToken, logout }),
}));

function renderPortal(
  role: Parameters<typeof getLoginPortal>[0] = "student",
  variant?: "portal" | "admin",
) {
  return render(
    <MemoryRouter>
      <RoleLoginPage portal={getLoginPortal(role)} variant={variant} />
    </MemoryRouter>,
  );
}

describe("RoleLoginPage", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    loginWithToken.mockReset();
    logout.mockReset();
  });

  it("submits credentials and keeps the session when the resolved role matches this portal", async () => {
    vi.mocked(apiPost).mockResolvedValue({ token: "tenant-id.raw-token" });
    loginWithToken.mockResolvedValue({ role: "student", email: "student@example.com" });
    const user = userEvent.setup();

    renderPortal("student");

    await user.type(screen.getByLabelText(/college id/i), "rvce");
    await user.type(screen.getByLabelText(/^email$/i), "student@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(apiPost).toHaveBeenCalledWith("/auth/login", {
      tenantSlug: "rvce",
      emailOrUsn: "student@example.com",
      password: "Correct-Horse-9",
    });
    expect(loginWithToken).toHaveBeenCalledWith("tenant-id.raw-token", true);
    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByText(/does not belong/i)).not.toBeInTheDocument();
  });

  it("signs out and shows a friendly error when the resolved role doesn't match this portal", async () => {
    vi.mocked(apiPost).mockResolvedValue({ token: "tenant-id.raw-token" });
    // A real college_admin logging in through the Student Portal.
    loginWithToken.mockResolvedValue({ role: "college_admin", email: "admin@example.com" });
    const user = userEvent.setup();

    renderPortal("student");

    await user.type(screen.getByLabelText(/college id/i), "rvce");
    await user.type(screen.getByLabelText(/^email$/i), "admin@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/does not belong to the Student Portal/i)).toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("shows the backend's error message on failed login", async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError("invalid credentials", 401));
    const user = userEvent.setup();

    renderPortal("student");

    await user.type(screen.getByLabelText(/college id/i), "rvce");
    await user.type(screen.getByLabelText(/^email$/i), "student@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("invalid credentials")).toBeInTheDocument();
    expect(loginWithToken).not.toHaveBeenCalled();
  });

  it("passes remember: false through to loginWithToken when unchecked", async () => {
    vi.mocked(apiPost).mockResolvedValue({ token: "tenant-id.raw-token" });
    loginWithToken.mockResolvedValue({ role: "student", email: "student@example.com" });
    const user = userEvent.setup();

    renderPortal("student");

    await user.type(screen.getByLabelText(/college id/i), "rvce");
    await user.type(screen.getByLabelText(/^email$/i), "student@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
    await user.click(screen.getByLabelText(/remember this device/i));
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(loginWithToken).toHaveBeenCalledWith("tenant-id.raw-token", false);
  });

  it("renders portal-specific branding", () => {
    renderPortal("alumni");
    expect(screen.getAllByText("Alumni Portal").length).toBeGreaterThan(0);
  });

  describe('variant="admin"', () => {
    it("omits the College ID field and posts only email + password to /auth/admin-login", async () => {
      vi.mocked(apiPost).mockResolvedValue({ token: "platform-tenant-id.raw-token" });
      loginWithToken.mockResolvedValue({ role: "super_admin", email: "root@example.com" });
      const user = userEvent.setup();

      renderPortal("super_admin", "admin");

      expect(screen.queryByLabelText(/college id/i)).not.toBeInTheDocument();

      await user.type(screen.getByLabelText(/^email$/i), "root@example.com");
      await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      expect(apiPost).toHaveBeenCalledWith("/auth/admin-login", {
        email: "root@example.com",
        password: "Correct-Horse-9",
      });
      expect(logout).not.toHaveBeenCalled();
    });

    it("hides the 'choose a different portal' link, since this page is private", () => {
      renderPortal("super_admin", "admin");
      expect(screen.queryByText(/choose a different portal/i)).not.toBeInTheDocument();
    });

    it("still signs out and shows a friendly error if a non-super_admin session is resolved", async () => {
      vi.mocked(apiPost).mockResolvedValue({ token: "platform-tenant-id.raw-token" });
      loginWithToken.mockResolvedValue({ role: "college_admin", email: "admin@example.com" });
      const user = userEvent.setup();

      renderPortal("super_admin", "admin");

      await user.type(screen.getByLabelText(/^email$/i), "admin@example.com");
      await user.type(screen.getByLabelText(/^password$/i), "Correct-Horse-9");
      await user.click(screen.getByRole("button", { name: /sign in/i }));

      expect(await screen.findByText(/does not belong to the IntroBuddy Platform/i)).toBeInTheDocument();
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });
});
