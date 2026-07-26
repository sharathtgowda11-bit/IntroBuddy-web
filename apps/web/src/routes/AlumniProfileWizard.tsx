import { PERMISSIONS } from "@introbuddy/shared";
import { UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Textarea } from "../components/ui/textarea.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatchMultipart, ApiError } from "../lib/apiClient.js";

interface AlumniProfile {
  name: string | null;
  email: string;
  collegeName: string | null;
  degreeName: string | null;
  departmentName: string | null;
  graduationYear: number | null;
  avatarUrl: string | null;
  bio: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  company: string | null;
  jobTitle: string | null;
  skills: string[] | null;
  country: string | null;
  city: string | null;
  yearsOfExperience: number | null;
  workEmail: string | null;
  profileComplete: boolean;
}

const STEPS = [
  { step: 1, label: "Personal info" },
  { step: 2, label: "Graduation details" },
  { step: 3, label: "Professional details" },
] as const;

/**
 * The 3-step alumni profile wizard. Step 1 and Step 3 are forms, each
 * submitted independently (PATCH /me/profile is a partial update -- one
 * call per step, matching the plan's decision). Step 2 is read-only:
 * degree/department/graduation year are admin-set at import and never
 * editable here, reusing the same inline read-only-field presentation
 * StudentProfile.tsx uses for its own locked fields, not a new component.
 */
export function AlumniProfileWizard() {
  const { can } = useSession();
  const [profile, setProfile] = useState<AlumniProfile | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [skills, setSkills] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [yearsOfExperience, setYearsOfExperience] = useState("");
  const [workEmail, setWorkEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function applyProfile(data: AlumniProfile) {
    setProfile(data);
    setBio(data.bio ?? "");
    setPhone(data.phone ?? "");
    setLinkedinUrl(data.linkedinUrl ?? "");
    setGithubUrl(data.githubUrl ?? "");
    setCompany(data.company ?? "");
    setJobTitle(data.jobTitle ?? "");
    setSkills((data.skills ?? []).join(", "));
    setCountry(data.country ?? "");
    setCity(data.city ?? "");
    setYearsOfExperience(data.yearsOfExperience !== null ? String(data.yearsOfExperience) : "");
    setWorkEmail(data.workEmail ?? "");
  }

  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadProfile() {
    const data = await apiGet<AlumniProfile>("/me/profile");
    applyProfile(data);
  }

  useEffect(() => {
    if (!can(PERMISSIONS.PROFILE_EDIT_OWN)) return;
    apiGet<AlumniProfile>("/me/profile")
      .then((data) => {
        applyProfile(data);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load your profile."));
  }, [can]);

  if (!can(PERMISSIONS.PROFILE_EDIT_OWN)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (!profile) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  async function handleSaveStep1(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData();
    if (bio.trim()) formData.append("bio", bio.trim());
    if (phone.trim()) formData.append("phone", phone.trim());
    if (linkedinUrl.trim()) formData.append("linkedinUrl", linkedinUrl.trim());
    if (githubUrl.trim()) formData.append("githubUrl", githubUrl.trim());
    if (avatarFile) formData.append("avatar", avatarFile);

    setIsSubmitting(true);
    try {
      await apiPatchMultipart("/me/profile", formData);
      await loadProfile();
      setAvatarFile(null);
      setMessage("Saved.");
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveStep3(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData();
    if (company.trim()) formData.append("company", company.trim());
    if (jobTitle.trim()) formData.append("jobTitle", jobTitle.trim());
    const skillsList = skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (skillsList.length > 0) formData.append("skills", JSON.stringify(skillsList));
    if (country.trim()) formData.append("country", country.trim());
    if (city.trim()) formData.append("city", city.trim());
    if (yearsOfExperience.trim()) formData.append("yearsOfExperience", yearsOfExperience.trim());
    if (workEmail.trim()) formData.append("workEmail", workEmail.trim());

    setIsSubmitting(true);
    try {
      await apiPatchMultipart("/me/profile", formData);
      await loadProfile();
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="My profile"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{profile.email}</span>
            {profile.profileComplete ? (
              <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                Complete
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent">
                Incomplete
              </span>
            )}
          </span>
        }
      />

      {!profile.profileComplete && (
        <div className="rounded-md border bg-brand-accent/5 px-4 py-3 text-sm text-muted-foreground">
          Complete all 3 steps to appear in the student-facing alumni directory and post opportunities.
        </div>
      )}

      <nav className="flex items-center gap-2 text-sm">
        {STEPS.map(({ step: s, label }) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
              step === s ? "bg-brand text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s}. {label}
          </button>
        ))}
      </nav>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Personal info</CardTitle>
            <CardDescription>Your photo and how alumni-network members can reach you.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSaveStep1}>
              <div className="space-y-2">
                <Label htmlFor="avatar">Photo</Label>
                <div className="flex items-center gap-4">
                  {profile.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="Current avatar" className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <UserRound className="h-7 w-7" />
                    </div>
                  )}
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/*"
                    className="max-w-xs"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                  <Input id="linkedinUrl" type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="githubUrl">GitHub URL</Label>
                  <Input id="githubUrl" type="url" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-success">{message}</p>}
              <Button type="submit" variant="brand" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save & continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Graduation details</CardTitle>
            <CardDescription>Set by your college at import. Contact your placement office to correct these.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <span className="text-muted-foreground">College — </span>
              {profile.collegeName ?? "—"}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Degree — </span>
              {profile.degreeName ?? "—"}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Department — </span>
              {profile.departmentName ?? "—"}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Graduation year — </span>
              {profile.graduationYear ?? "—"}
            </p>
            <Button type="button" variant="outline" onClick={() => setStep(3)}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Professional details</CardTitle>
            <CardDescription>What you're doing now — this is what students will see and search on.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSaveStep3}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobTitle">Job title</Label>
                  <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="yearsOfExperience">Years of experience</Label>
                  <Input
                    id="yearsOfExperience"
                    type="number"
                    min="0"
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workEmail">Work email (optional)</Label>
                  <Input id="workEmail" type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills (comma-separated)</Label>
                <Input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, SQL, Leadership" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-success">{message}</p>}
              <Button type="submit" variant="brand" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
