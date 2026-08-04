import { PERMISSIONS, type StudentEditInput } from "@introbuddy/shared";
import { UploadCloud } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatch, apiPost, ApiError } from "../lib/apiClient.js";

interface Student {
  id: string;
  name: string | null;
  usn: string | null;
  email: string;
  status: "invited" | "active" | "deactivated";
  graduationYear: number | null;
  degreeId: string | null;
  degreeName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  profileComplete: boolean;
}

interface Department {
  id: string;
  name: string;
}

interface StudentListResult {
  students: Student[];
  total: number;
}

const PAGE_SIZE = 50;

export function StudentManagement() {
  const { can } = useSession();
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<StudentEditInput>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildParams(): Record<string, string | number | undefined> {
    return {
      search: search || undefined,
      status: status || undefined,
      departmentId: departmentId || undefined,
      limit: PAGE_SIZE,
      offset,
    };
  }

  function applyStudents(result: StudentListResult) {
    setStudents(result.students);
    setTotal(result.total);
  }

  async function loadStudents() {
    const result = await apiGet<StudentListResult>("/students", buildParams());
    applyStudents(result);
  }

  useEffect(() => {
    if (!can(PERMISSIONS.STUDENT_EDIT_MANAGED_FIELDS)) return;
    apiGet<{ departments: Department[] }>("/departments").then((data) => {
      setDepartments(data.departments);
    });
  }, [can]);

  useEffect(() => {
    if (!can(PERMISSIONS.STUDENT_EDIT_MANAGED_FIELDS)) return;
    apiGet<StudentListResult>("/students", buildParams()).then((result) => {
      applyStudents(result);
    });
    // Deliberately re-fetches only on pagination -- search/status/department
    // changes are applied explicitly via the Search button, not on every
    // keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  if (!can(PERMISSIONS.STUDENT_EDIT_MANAGED_FIELDS)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  async function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    await loadStudents();
  }

  function startEdit(student: Student) {
    setEditingId(student.id);
    setEditForm({
      name: student.name ?? undefined,
      usn: student.usn ?? undefined,
      departmentId: student.departmentId ?? undefined,
      graduationYear: student.graduationYear ?? undefined,
    });
    setError(null);
  }

  async function handleSaveEdit(id: string) {
    setError(null);
    try {
      await apiPatch(`/students/${id}`, editForm);
      setEditingId(null);
      await loadStudents();
      setMessage("Student updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleToggleStatus(student: Student) {
    const nextStatus = student.status === "deactivated" ? "active" : "deactivated";
    await apiPatch(`/students/${student.id}/status`, { status: nextStatus });
    await loadStudents();
  }

  async function handleTriggerReset(id: string) {
    await apiPost(`/students/${id}/trigger-reset`, {});
    setMessage("Password reset email sent.");
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Students</CardTitle>
          <CardDescription>{total} total</CardDescription>
        </div>
        {can(PERMISSIONS.STUDENT_IMPORT) && (
          <Button asChild>
            <Link to="/college/import">
              <UploadCloud className="h-4 w-4" />
              Import Students
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap items-end gap-3" onSubmit={handleSearchSubmit}>
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <Input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, USN" />
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
                <th className="py-2 pr-3">USN</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Department</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) =>
                editingId === student.id ? (
                  <tr key={student.id} className="border-b">
                    <td className="py-2 pr-3" colSpan={6}>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`name-${student.id}`}>Name</Label>
                          <Input
                            id={`name-${student.id}`}
                            value={editForm.name ?? ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`usn-${student.id}`}>USN</Label>
                          <Input
                            id={`usn-${student.id}`}
                            value={editForm.usn ?? ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, usn: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`dept-${student.id}`}>Department</Label>
                          <Select
                            id={`dept-${student.id}`}
                            value={editForm.departmentId ?? ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, departmentId: e.target.value }))}
                          >
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`year-${student.id}`}>Graduation year</Label>
                          <Input
                            id={`year-${student.id}`}
                            type="number"
                            value={editForm.graduationYear ?? ""}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, graduationYear: Number(e.target.value) }))}
                          />
                        </div>
                        <Button size="sm" onClick={() => handleSaveEdit(student.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={student.id} className="border-b">
                    <td className="py-2 pr-3">{student.name ?? "—"}</td>
                    <td className="py-2 pr-3">{student.usn ?? "—"}</td>
                    <td className="py-2 pr-3">{student.email}</td>
                    <td className="py-2 pr-3">{student.departmentName ?? "—"}</td>
                    <td className="py-2 pr-3">{student.status}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => startEdit(student)}>
                          Edit
                        </Button>
                        {can(PERMISSIONS.STUDENT_DEACTIVATE) && (
                          <Button size="sm" variant="outline" onClick={() => handleToggleStatus(student)}>
                            {student.status === "deactivated" ? "Reactivate" : "Deactivate"}
                          </Button>
                        )}
                        {can(PERMISSIONS.PASSWORD_TRIGGER_RESET) && (
                          <Button size="sm" variant="ghost" onClick={() => handleTriggerReset(student.id)}>
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
            {students.length === 0 ? 0 : offset + 1}–{offset + students.length} of {total}
          </span>
          <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((prev) => prev + PAGE_SIZE)}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
