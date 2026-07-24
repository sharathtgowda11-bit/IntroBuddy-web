import { PERMISSIONS } from "@introbuddy/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { useSession } from "../context/sessionContext.js";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "../lib/apiClient.js";

interface Degree {
  id: string;
  name: string;
}

interface Department {
  id: string;
  degreeId: string;
  name: string;
}

export function DegreeManagement() {
  const { can } = useSession();
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDegreeName, setNewDegreeName] = useState("");
  const [newDepartmentName, setNewDepartmentName] = useState<Record<string, string>>({});
  const [renamingDegreeId, setRenamingDegreeId] = useState<string | null>(null);
  const [renamingDegreeName, setRenamingDegreeName] = useState("");
  const [renamingDepartmentId, setRenamingDepartmentId] = useState<string | null>(null);
  const [renamingDepartmentName, setRenamingDepartmentName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    const [degreesResult, departmentsResult] = await Promise.all([
      apiGet<{ degrees: Degree[] }>("/degrees"),
      apiGet<{ departments: Department[] }>("/departments"),
    ]);
    setDegrees(degreesResult.degrees);
    setDepartments(departmentsResult.departments);
  }

  useEffect(() => {
    if (!can(PERMISSIONS.DEGREE_MANAGE)) return;
    Promise.all([apiGet<{ degrees: Degree[] }>("/degrees"), apiGet<{ departments: Department[] }>("/departments")]).then(
      ([degreesResult, departmentsResult]) => {
        setDegrees(degreesResult.degrees);
        setDepartments(departmentsResult.departments);
      },
    );
  }, [can]);

  if (!can(PERMISSIONS.DEGREE_MANAGE)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  async function handleAddDegree(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/degrees", { name: newDegreeName });
      setNewDegreeName("");
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleRenameDegree(id: string) {
    setError(null);
    try {
      await apiPatch(`/degrees/${id}`, { name: renamingDegreeName });
      setRenamingDegreeId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleDeleteDegree(id: string) {
    setError(null);
    try {
      await apiDelete(`/degrees/${id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleAddDepartment(degreeId: string, event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiPost("/departments", { degreeId, name: newDepartmentName[degreeId] ?? "" });
      setNewDepartmentName((prev) => ({ ...prev, [degreeId]: "" }));
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleRenameDepartment(id: string) {
    setError(null);
    try {
      await apiPatch(`/departments/${id}`, { name: renamingDepartmentName });
      setRenamingDepartmentId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleDeleteDepartment(id: string) {
    setError(null);
    try {
      await apiDelete(`/departments/${id}`);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Degrees & departments</CardTitle>
          <CardDescription>Manage your college's academic structure.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <form className="flex items-end gap-3" onSubmit={handleAddDegree}>
            <div className="space-y-2">
              <Label htmlFor="newDegree">New degree</Label>
              <Input id="newDegree" value={newDegreeName} onChange={(e) => setNewDegreeName(e.target.value)} required />
            </div>
            <Button type="submit">Add degree</Button>
          </form>
        </CardContent>
      </Card>

      {degrees.map((degree) => (
        <Card key={degree.id}>
          <CardHeader>
            {renamingDegreeId === degree.id ? (
              <div className="flex items-end gap-3">
                <Input value={renamingDegreeName} onChange={(e) => setRenamingDegreeName(e.target.value)} />
                <Button size="sm" onClick={() => handleRenameDegree(degree.id)}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRenamingDegreeId(null)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <CardTitle>{degree.name}</CardTitle>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRenamingDegreeId(degree.id);
                      setRenamingDegreeName(degree.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleDeleteDegree(degree.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {departments
                .filter((d) => d.degreeId === degree.id)
                .map((department) =>
                  renamingDepartmentId === department.id ? (
                    <li key={department.id} className="flex items-end gap-3">
                      <Input value={renamingDepartmentName} onChange={(e) => setRenamingDepartmentName(e.target.value)} />
                      <Button size="sm" onClick={() => handleRenameDepartment(department.id)}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setRenamingDepartmentId(null)}>
                        Cancel
                      </Button>
                    </li>
                  ) : (
                    <li key={department.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span>{department.name}</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setRenamingDepartmentId(department.id);
                            setRenamingDepartmentName(department.name);
                          }}
                        >
                          Rename
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteDepartment(department.id)}>
                          Delete
                        </Button>
                      </div>
                    </li>
                  ),
                )}
            </ul>
            <form className="flex items-end gap-3" onSubmit={(e) => handleAddDepartment(degree.id, e)}>
              <div className="space-y-2">
                <Label htmlFor={`newDepartment-${degree.id}`}>New department</Label>
                <Input
                  id={`newDepartment-${degree.id}`}
                  value={newDepartmentName[degree.id] ?? ""}
                  onChange={(e) => setNewDepartmentName((prev) => ({ ...prev, [degree.id]: e.target.value }))}
                  required
                />
              </div>
              <Button type="submit" size="sm" variant="outline">
                Add department
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
