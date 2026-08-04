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

async function selectFromCombobox(user: ReturnType<typeof userEvent.setup>, labelPattern: RegExp, query: string, optionName: string) {
  const input = screen.getByLabelText(labelPattern);
  await user.type(input, query);
  await user.click(await screen.findByRole("option", { name: optionName }));
}

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/college full name/i), "Test College");
  await user.type(screen.getByLabelText(/college short name/i), "TestCollege");
  await selectFromCombobox(user, /state/i, "Karnat", "Karnataka");
  await selectFromCombobox(user, /city/i, "Bengal", "Bengaluru");
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
    expect(screen.queryByLabelText(/college full name/i)).not.toBeInTheDocument();
  });

  it("submits the form and shows the returned college ID", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: "tenant-id", slug: "test-college", status: "provisioning" });
    const user = userEvent.setup();
    renderCreateCollege();

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /create college/i }));

    expect(apiPost).toHaveBeenCalledWith("/colleges", {
      name: "Test College",
      shortName: "TestCollege",
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

  it("disables the City field until a State is chosen", () => {
    renderCreateCollege();

    expect(screen.getByLabelText(/city/i)).toBeDisabled();
  });

  it("enables City and offers only that State's cities once a State is selected", async () => {
    const user = userEvent.setup();
    renderCreateCollege();

    await selectFromCombobox(user, /state/i, "Karnat", "Karnataka");

    const city = screen.getByLabelText(/city/i);
    expect(city).not.toBeDisabled();
    await user.click(city);
    expect(await screen.findByRole("option", { name: "Bengaluru" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Mumbai" })).not.toBeInTheDocument();
  });

  it("clears the selected City and disables it again when the State changes", async () => {
    const user = userEvent.setup();
    renderCreateCollege();

    await selectFromCombobox(user, /state/i, "Karnat", "Karnataka");
    await selectFromCombobox(user, /city/i, "Bengal", "Bengaluru");
    expect(screen.getByLabelText(/city/i)).toHaveValue("Bengaluru");

    await selectFromCombobox(user, /state/i, "Maharas", "Maharashtra");

    expect(screen.getByLabelText(/city/i)).toHaveValue("");
    expect(screen.getByLabelText(/city/i)).not.toBeDisabled();
  });

  it("does not submit without a State and City selected", async () => {
    const user = userEvent.setup();
    renderCreateCollege();

    await user.type(screen.getByLabelText(/college full name/i), "Test College");
    await user.type(screen.getByLabelText(/college short name/i), "TestCollege");
    await user.type(screen.getByLabelText(/admin name/i), "Test Admin");
    await user.type(screen.getByLabelText(/admin email/i), "admin@example.com");
    await user.click(screen.getByRole("button", { name: /create college/i }));

    expect(apiPost).not.toHaveBeenCalled();
  });

  it("lets the user add a custom city that isn't in the list", async () => {
    vi.mocked(apiPost).mockResolvedValue({ id: "tenant-id", slug: "test-college", status: "provisioning" });
    const user = userEvent.setup();
    renderCreateCollege();

    await selectFromCombobox(user, /state/i, "Karnat", "Karnataka");
    await user.type(screen.getByLabelText(/city/i), "Chikkaballapur Rural");
    await user.click(screen.getByRole("option", { name: /other.*add city/i }));

    const city = screen.getByLabelText(/city/i);
    expect(city).toHaveValue("Chikkaballapur Rural");
    expect(screen.getByText(/custom city/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/college full name/i), "Test College");
    await user.type(screen.getByLabelText(/college short name/i), "TestCollege");
    await user.type(screen.getByLabelText(/admin name/i), "Test Admin");
    await user.type(screen.getByLabelText(/admin email/i), "admin@example.com");
    await user.click(screen.getByRole("button", { name: /create college/i }));

    expect(apiPost).toHaveBeenCalledWith("/colleges", {
      name: "Test College",
      shortName: "TestCollege",
      city: "Chikkaballapur Rural",
      state: "Karnataka",
      adminName: "Test Admin",
      adminEmail: "admin@example.com",
    });
  });

  it("reverts a custom city back to normal searching if the field is cleared", async () => {
    const user = userEvent.setup();
    renderCreateCollege();

    await selectFromCombobox(user, /state/i, "Karnat", "Karnataka");
    const city = screen.getByLabelText(/city/i);
    await user.type(city, "Somewhere Else");
    await user.click(screen.getByRole("option", { name: /other.*add city/i }));
    expect(screen.getByText(/custom city/i)).toBeInTheDocument();

    await user.clear(city);
    expect(screen.queryByText(/custom city/i)).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Bengaluru" })).toBeInTheDocument();
  });

  it("does not offer a custom-entry option on the State field", async () => {
    const user = userEvent.setup();
    renderCreateCollege();

    await user.click(screen.getByLabelText(/state/i));
    expect(screen.queryByRole("option", { name: /other.*add/i })).not.toBeInTheDocument();
  });
});
