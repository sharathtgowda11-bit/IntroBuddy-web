import { PERMISSIONS } from "@introbuddy/shared";
import { BadgeCheck, GraduationCap, Linkedin, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
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
  linkedinUrl: string | null;
  graduationYear: number | null;
  departmentName: string | null;
  mentorshipAvailable: boolean;
}

interface Department {
  id: string;
  name: string;
}

export function AlumniDirectory() {
  const { can } = useSession();
  const navigate = useNavigate();
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
            <Card
              key={alumnus.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/alumni-directory/${alumnus.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") navigate(`/alumni-directory/${alumnus.id}`);
              }}
              className="relative h-full cursor-pointer transition-shadow hover:shadow-md"
            >
              {/* Every alumnus reaching this list is already gated to
                  status='active' + a complete profile (Part 4's directory
                  visibility rule) -- this badge states that real,
                  already-enforced guarantee rather than a fabricated
                  per-alumnus "availability" status the data model doesn't have. */}
              <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
                <BadgeCheck className="h-3 w-3" />
                Verified
              </span>

              <CardContent className="flex flex-col items-center pt-8 text-center">
                {alumnus.avatarUrl ? (
                  <img src={alumnus.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <UserRound className="h-7 w-7" />
                  </div>
                )}

                <p className="mt-3 font-semibold">{alumnus.name ?? "Alumnus"}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {alumnus.jobTitle ? (
                    <>
                      {alumnus.jobTitle}
                      {alumnus.company && (
                        <>
                          {" "}
                          at <span className="font-medium text-foreground">{alumnus.company}</span>
                        </>
                      )}
                    </>
                  ) : (
                    alumnus.company || "—"
                  )}
                </p>

                {alumnus.linkedinUrl && (
                  <a
                    href={alumnus.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`${alumnus.name ?? "Alumnus"}'s LinkedIn profile`}
                    className="mt-3 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                  </a>
                )}

                <div className="mt-4 flex w-full flex-wrap justify-center gap-2 border-t pt-4">
                  {alumnus.departmentName && (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      {alumnus.departmentName}
                    </span>
                  )}
                  {alumnus.graduationYear && (
                    <span className="rounded-full bg-brand-accent/10 px-2.5 py-1 text-xs font-medium text-brand-accent">
                      Class of &apos;{String(alumnus.graduationYear).slice(-2)}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      alumnus.mentorshipAvailable
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <GraduationCap className="h-3 w-3" />
                    {alumnus.mentorshipAvailable ? "Available for Mentorship" : "Not Available"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
