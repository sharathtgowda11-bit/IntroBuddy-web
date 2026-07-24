import { PERMISSIONS, type InvitationCreateInput } from "@introbuddy/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPost, ApiError } from "../lib/apiClient.js";

interface Department {
  id: string;
  name: string;
}

const currentYear = new Date().getFullYear();

export function InviteStudent() {
  const { can } = useSession();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState("");
  const [usn, setUsn] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [graduationYear, setGraduationYear] = useState(currentYear);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!can(PERMISSIONS.STUDENT_INVITE)) return;
    apiGet<{ departments: Department[] }>("/departments").then((data) => {
      setDepartments(data.departments);
    });
  }, [can]);

  if (!can(PERMISSIONS.STUDENT_INVITE)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const body: InvitationCreateInput = { email, role: "student", usn, departmentId, graduationYear };
      await apiPost("/invitations", body);
      setMessage("Invitation sent.");
      setEmail("");
      setUsn("");
      setDepartmentId("");
      setGraduationYear(currentYear);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Invite a student</CardTitle>
        <CardDescription>Sends an activation email to the student's inbox.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="usn">USN</Label>
            <Input id="usn" value={usn} onChange={(e) => setUsn(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Select id="department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required>
              <option value="" disabled>
                Select a department
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="graduationYear">Graduation year</Label>
            <Input
              id="graduationYear"
              type="number"
              value={graduationYear}
              onChange={(e) => setGraduationYear(Number(e.target.value))}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-success">{message}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
