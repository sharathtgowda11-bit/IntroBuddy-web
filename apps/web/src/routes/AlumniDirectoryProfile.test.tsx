import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "../lib/apiClient.js";
import { AlumniDirectoryProfile } from "./AlumniDirectoryProfile.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

const baseAlumnus = {
  id: "alumnus-1",
  name: "Siri Alumna",
  avatarUrl: null,
  company: "Acme Corp",
  jobTitle: "Engineer",
  city: "Metropolis",
  country: "USA",
  linkedinUrl: null,
  bio: null,
  graduationYear: 2020,
  departmentName: "Computer Science and Engineering",
  mentorshipAvailable: true,
  opportunities: [],
};

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={["/alumni-directory/alumnus-1"]}>
      <Routes>
        <Route path="/alumni-directory/:id" element={<AlumniDirectoryProfile />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AlumniDirectoryProfile", () => {
  beforeEach(() => {
    can = () => true;
    vi.mocked(apiGet).mockReset();
  });

  it("shows the Request mentorship button and an availability badge when the alumnus is available", async () => {
    vi.mocked(apiGet).mockResolvedValue(baseAlumnus);
    renderProfile();

    expect(await screen.findByRole("button", { name: /request mentorship/i })).toBeInTheDocument();
    expect(screen.getByText("Available for Mentorship")).toBeInTheDocument();
  });

  it("hides the Request mentorship button and explains why when the alumnus opted out", async () => {
    vi.mocked(apiGet).mockResolvedValue({ ...baseAlumnus, mentorshipAvailable: false });
    renderProfile();

    await screen.findByText(/not currently available for mentorship/i);
    expect(screen.queryByRole("button", { name: /request mentorship/i })).not.toBeInTheDocument();
    expect(screen.getByText("Not Available for Mentorship")).toBeInTheDocument();
  });
});
