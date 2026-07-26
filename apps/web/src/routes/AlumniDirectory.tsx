import { PERMISSIONS } from "@introbuddy/shared";
import { UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, ApiError } from "../lib/apiClient.js";

interface DirectoryAlumnus {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  country: string | null;
  graduationYear: number | null;
  departmentName: string | null;
}

interface Department {
  id: string;
  name: string;
}

export function AlumniDirectory() {
  const { can } = useSession();
  const [alumni, setAlumni] = useState<DirectoryAlumnus[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [graduationYear, setGraduationYear] = useState("");
  const [error, setError] = useState<string | null>(null);

  function buildParams(): Record<string, string | undefined> {
    return {
      search: search || undefined,
      company: company || undefined,
      departmentId: departmentId || undefined,
      graduationYear: graduationYear || undefined,
    };
  }

  async function loadAlumni() {
    try {
      const result = await apiGet<{ alumni: DirectoryAlumnus[] }>("/alumni-directory", buildParams());
      setAlumni(result.alumni);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the directory. Please try again.");
    }
  }

  useEffect(() => {
    if (!can(PERMISSIONS.ALUMNI_DIRECTORY_VIEW)) return;
    apiGet<{ departments: Department[] }>("/departments")
      .then((data) => setDepartments(data.departments))
      .catch(() => {
        /* non-fatal -- the department filter just stays empty */
      });
    apiGet<{ alumni: DirectoryAlumnus[] }>("/alumni-directory", buildParams())
      .then((result) => {
        setAlumni(result.alumni);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the directory. Please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [can]);

  if (!can(PERMISSIONS.ALUMNI_DIRECTORY_VIEW)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  async function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    await loadAlumni();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Alumni directory" description="Browse verified alumni from your college for mentorship and referrals." />

      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleSearchSubmit}>
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input id="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or company" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyFilter">Company</Label>
              <Input id="companyFilter" value={company} onChange={(e) => setCompany(e.target.value)} />
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
            <div className="space-y-2">
              <Label htmlFor="graduationYearFilter">Graduation year</Label>
              <Input
                id="graduationYearFilter"
                type="number"
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
              />
            </div>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {alumni.length === 0 ? (
        <p className="text-sm text-muted-foreground">No alumni match your filters.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {alumni.map((alumnus) => (
            <Link key={alumnus.id} to={`/alumni-directory/${alumnus.id}`}>
              <Card className="h-full transition-colors hover:border-brand">
                <CardContent className="flex items-start gap-3 pt-6">
                  {alumnus.avatarUrl ? (
                    <img src={alumnus.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserRound className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">{alumnus.name ?? "Alumnus"}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {alumnus.jobTitle ? `${alumnus.jobTitle}${alumnus.company ? ` at ${alumnus.company}` : ""}` : "—"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[alumnus.departmentName, alumnus.graduationYear].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
