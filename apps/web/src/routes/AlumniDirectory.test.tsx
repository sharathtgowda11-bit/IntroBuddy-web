import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../lib/apiClient.js";
import { AlumniDirectory } from "./AlumniDirectory.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

const availableAlumnus = {
  id: "alumnus-available",
  name: "Available Alumna",
  avatarUrl: null,
  company: "Acme Corp",
  jobTitle: "Engineer",
  city: "Metropolis",
  country: "USA",
  linkedinUrl: null,
  graduationYear: 2020,
  departmentName: "Computer Science and Engineering",
  mentorshipAvailable: true,
};

const unavailableAlumnus = {
  ...availableAlumnus,
  id: "alumnus-unavailable",
  name: "Unavailable Alumna",
  mentorshipAvailable: false,
};

function renderDirectory() {
  return render(
    <MemoryRouter>
      <AlumniDirectory />
    </MemoryRouter>,
  );
}

describe("AlumniDirectory", () => {
  beforeEach(() => {
    can = () => true;
    vi.mocked(apiGet).mockReset();
    vi.mocked(apiGet).mockImplementation((path: string) => {
      if (path === "/departments") return Promise.resolve({ departments: [] });
      return Promise.resolve({ alumni: [availableAlumnus, unavailableAlumnus] });
    });
  });

  it("shows an 'Available for Mentorship' badge for an available alumnus and 'Not Available' for one who opted out", async () => {
    renderDirectory();

    expect(await screen.findByText("Available Alumna")).toBeInTheDocument();
    expect(screen.getAllByText("Available for Mentorship")).toHaveLength(1);
    expect(screen.getByText("Not Available")).toBeInTheDocument();
  });
});
