import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdminLogin } from "./AdminLogin.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiPost: vi.fn() };
});

vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ loginWithToken: vi.fn(), logout: vi.fn() }),
}));

describe("AdminLogin", () => {
  it("renders the super_admin portal's email/password-only form", () => {
    render(
      <MemoryRouter>
        <AdminLogin />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("IntroBuddy Platform").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/college id/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("marks the page noindex, nofollow so it never surfaces via search", () => {
    render(
      <MemoryRouter>
        <AdminLogin />
      </MemoryRouter>,
    );

    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  });
});
