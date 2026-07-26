import { PERMISSIONS, type AlumniEditInput } from "@introbuddy/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatch, apiPost, ApiError } from "../lib/apiClient.js";

interface Alumnus {
  id: string;
  name: string | null;
  email: string;
  status: "invited" | "active" | "deactivated";
  graduationYear: number | null;
  degreeId: string | null;
  degreeName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  company: string | null;
  profileComplete: boolean;
}

interface Department {
  id: string;
  name: string;
}

interface AlumniListResult {
  alumni: Alumnus[];
  total: number;
}

const PAGE_SIZE = 50;

/** Mirrors StudentManagement.tsx deliberately -- same search/filter/edit/deactivate/reset shape, adapted for alumni's field set (no USN, plus a company filter). */
export function AlumniManagement() {
  const { can } = useSession();
  const [alumni, setAlumni] = useState<Alumnus[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AlumniEditInput>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildParams(): Record<string, string | number | undefined> {
    return {
      search: search || undefined,
      company: company || undefined,
      status: status || undefined,
      departmentId: departmentId || undefined,
      limit: PAGE_SIZE,
      offset,
    };
  }

  function applyAlumni(result: AlumniListResult) {
    setAlumni(result.alumni);
    setTotal(result.total);
  }

  async function loadAlumni() {
    try {
      const result = await apiGet<AlumniListResult>("/alumni", buildParams());
      applyAlumni(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load alumni. Please try again.");
    }
  }

  useEffect(() => {
    if (!can(PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS)) return;
    apiGet<{ departments: Department[] }>("/departments")
      .then((data) => {
        setDepartments(data.departments);
      })
      .catch(() => {
        /* non-fatal -- the department filter just stays empty */
      });
  }, [can]);

  useEffect(() => {
    if (!can(PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS)) return;
    apiGet<AlumniListResult>("/alumni", buildParams())
      .then((result) => {
        applyAlumni(result);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load alumni. Please try again."));
    // Deliberately re-fetches only on pagination -- search/status/department/
    // company changes are applied explicitly via the Search button, not on
    // every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  if (!can(PERMISSIONS.ALUMNI_EDIT_MANAGED_FIELDS)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  async function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    await loadAlumni();
  }

  function startEdit(alumnus: Alumnus) {
    setEditingId(alumnus.id);
    setEditForm({
      name: alumnus.name ?? undefined,
      departmentId: alumnus.departmentId ?? undefined,
      graduationYear: alumnus.graduationYear ?? undefined,
    });
    setError(null);
  }

  async function handleSaveEdit(id: string) {
    setError(null);
    try {
      await apiPatch(`/alumni/${id}`, editForm);
      setEditingId(null);
      await loadAlumni();
      setMessage("Alumnus updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleToggleStatus(alumnus: Alumnus) {
    const nextStatus = alumnus.status === "deactivated" ? "active" : "deactivated";
    await apiPatch(`/alumni/${alumnus.id}/status`, { status: nextStatus });
    await loadAlumni();
  }

  async function handleTriggerReset(id: string) {
    await apiPost(`/alumni/${id}/trigger-reset`, {});
    setMessage("Password reset email sent.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alumni</CardTitle>
        <CardDescription>{total} total</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={handleSearchSubmit}>
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <Input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="companyFilter">Company</Label>
            <Input id="companyFilter" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="statusFilter">Status</Label>
            <Select id="statusFilter" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="departmentFilter">Department</Label>
            <Select id="departmentFilter" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit">Search</Button>
        </form>
        {message && <p className="text-sm text-success">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Company</th>
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Profile</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {alumni.map((alumnus) =>
                editingId === alumnus.id ? (
                  <tr key={alumnus.id} className="border-b">
                    <td className="py-2 pr-3" colSpan={7}>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`name-${alumnus.id}`}>Name</Label>
                          <Input
                            id={`name-${alumnus.id}`}
                            value={editForm.name ?? ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`dept-${alumnus.id}`}>Department</Label>
                          <Select
                            id={`dept-${alumnus.id}`}
                            value={editForm.departmentId ?? ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, departmentId: e.target.value }))}
                          >
                            <option value="">— none —</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`year-${alumnus.id}`}>Graduation year</Label>
                          <Input
                            id={`year-${alumnus.id}`}
                            type="number"
                            value={editForm.graduationYear ?? ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, graduationYear: Number(e.target.value) }))}
                          />
                        </div>
                        <Button size="sm" onClick={() => handleSaveEdit(alumnus.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={alumnus.id} className="border-b">
                    <td className="py-2 pr-3">{alumnus.name ?? "—"}</td>
                    <td className="py-2 pr-3">{alumnus.email}</td>
                    <td className="py-2 pr-3">{alumnus.company ?? "—"}</td>
                    <td className="py-2 pr-3">{alumnus.departmentName ?? "—"}</td>
                    <td className="py-2 pr-3">{alumnus.status}</td>
                    <td className="py-2 pr-3">
                      {alumnus.profileComplete ? (
                        <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                          Complete
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Incomplete
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(alumnus)}>
                          Edit
                        </Button>
                        {can(PERMISSIONS.ALUMNI_DEACTIVATE) && (
                          <Button size="sm" variant="outline" onClick={() => handleToggleStatus(alumnus)}>
                            {alumnus.status === "deactivated" ? "Reactivate" : "Deactivate"}
                          </Button>
                        )}
                        {can(PERMISSIONS.PASSWORD_TRIGGER_RESET) && (
                          <Button size="sm" variant="ghost" onClick={() => handleTriggerReset(alumnus.id)}>
                            Reset password
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}>
            Previous
          </Button>
          <span>
            {alumni.length === 0 ? 0 : offset + 1}–{offset + alumni.length} of {total}
          </span>
          <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((prev) => prev + PAGE_SIZE)}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
