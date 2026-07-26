import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { Home } from "./Home.js";

let session: { name: string | null; email: string; role: "super_admin" | "college_admin" | "student" | "alumni" } = {
  name: "Test User",
  email: "test@example.com",
  role: "college_admin",
};

vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ session, can: () => true }),
}));

describe("Home", () => {
  it("redirects super_admin straight to the platform dashboard instead of showing the card grid", () => {
    session = { name: "Sam Super", email: "super@example.com", role: "super_admin" };
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/admin/dashboard" element={<div>Platform dashboard page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Platform dashboard page")).toBeInTheDocument();
    expect(screen.queryByText("Create a college")).not.toBeInTheDocument();
  });

  it("redirects college_admin straight to their dashboard instead of showing the card grid", () => {
    session = { name: "Cam Admin", email: "admin@example.com", role: "college_admin" };
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/college/dashboard" element={<div>College dashboard page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("College dashboard page")).toBeInTheDocument();
    expect(screen.queryByText("Import students")).not.toBeInTheDocument();
  });

  it("redirects a student straight to their profile", () => {
    session = { name: null, email: "student@example.com", role: "student" };
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<div>Student profile page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Student profile page")).toBeInTheDocument();
  });

  it("redirects an alumnus straight to their dashboard", () => {
    session = { name: "Ali Alum", email: "alum@example.com", role: "alumni" };
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/alumni/dashboard" element={<div>Alumni dashboard page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Alumni dashboard page")).toBeInTheDocument();
  });
});
