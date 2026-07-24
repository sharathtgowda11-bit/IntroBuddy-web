import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiPost } from "../lib/apiClient.js";
import { CreateCollege } from "./CreateCollege.js";

vi.mock("../lib/apiClient.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/apiClient.js")>("../lib/apiClient.js");
  return { ...actual, apiPost: vi.fn() };
});

let can: (permission: string) => boolean = () => true;
vi.mock("../context/sessionContext.js", () => ({
  useSession: () => ({ can: (permission: string) => can(permission) }),
}));

function renderCreateCollege() {
  return render(
    <MemoryRouter>
      <CreateCollege />
    </MemoryRouter>,
  );
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/college name/i), "Test College");
  await user.type(screen.getByLabelText(/city/i), "Bengaluru");
  await user.type(screen.getByLabelText(/state/i), "Karnataka");
  await user.type(screen.getByLabelText(/admin name/i), "Test Admin");
  await user.type(screen.getByLabelText(/admin email/i), "admin@example.com");
}

describe("CreateCollege", () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
    can = () => true;
  });

  it("renders an access-denied message when the caller lacks permission", () => {
    can = () => false;
    renderCreateCollege();

    expect(screen.getByText(/don't have access/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/college name/i)).not.toBeInTheDocument();
  });

  it("submits the form and shows the returned college ID", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: "tenant-id", slug: "test-college", status: "provisioning" });
    const user = userEvent.setup();
    renderCreateCollege();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create college/i }));

    expect(apiPost).toHaveBeenCalledWith("/colleges", {
      name: "Test College",
      city: "Bengaluru",
      state: "Karnataka",
      adminName: "Test Admin",
      adminEmail: "admin@example.com",
    });
    expect(await screen.findByText("test-college")).toBeInTheDocument();
  });

  it("shows the backend's error message on conflict", async () => {
    vi.mocked(apiPost).mockRejectedValue(new ApiError("an active account already exists for this admin email", 409));
    const user = userEvent.setup();
    renderCreateCollege();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create college/i }));

    expect(await screen.findByText(/an active account already exists/i)).toBeInTheDocument();
  });
});
