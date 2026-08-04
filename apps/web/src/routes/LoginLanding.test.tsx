import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LoginLanding } from "./LoginLanding.js";

describe("LoginLanding", () => {
  it("renders a clickable card for each public role, linking to that role's login page", () => {
    render(
      <MemoryRouter>
        <LoginLanding />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /continue to college admin/i })).toHaveAttribute(
      "href",
      "/login/college-admin",
    );
    expect(screen.getByRole("link", { name: /continue to student/i })).toHaveAttribute("href", "/login/student");
    expect(screen.getByRole("link", { name: /continue to alumni/i })).toHaveAttribute("href", "/login/alumni");
  });

  it("never advertises the private Super Admin portal", () => {
    render(
      <MemoryRouter>
        <LoginLanding />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: /continue to super admin/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/super admin/i)).not.toBeInTheDocument();
  });
});
