import { PERMISSIONS } from "@introbuddy/shared";
import { Camera, GraduationCap, Github, Linkedin, Phone, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { ImageCropDialog } from "../components/ImageCropDialog.js";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Checkbox } from "../components/ui/checkbox.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Textarea } from "../components/ui/textarea.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatchMultipart, ApiError } from "../lib/apiClient.js";
import { cn } from "../lib/utils.js";

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
  mentorshipAvailable: boolean;
  profileComplete: boolean;
}

const STEPS = [
  { step: 1, label: "Personal info" },
  { step: 2, label: "Graduation details" },
  { step: 3, label: "Professional details" },
] as const;

function Field({ title, htmlFor, children }: { title: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </Label>
      {children}
    </div>
  );
}

/** Icon-prefixed input, matching StudentProfile.tsx's Contact Details treatment. */
function IconInput({ icon: Icon, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: typeof Phone }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("pl-9", className)} {...props} />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-sm">
      <span className="text-muted-foreground">{label} — </span>
      {value}
    </div>
  );
}

/**
 * The 3-step alumni profile wizard. Step 1 and Step 3 are forms, each
 * submitted independently (PATCH /me/profile is a partial update -- one
 * call per step, matching the plan's decision). Step 2 is read-only:
 * degree/department/graduation year are admin-set at import and never
 * editable here.
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [mentorshipAvailable, setMentorshipAvailable] = useState(true);

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

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);

  function applyProfile(data: AlumniProfile) {
    setProfile(data);
    setBio(data.bio ?? "");
    setPhone(data.phone ?? "");
    setLinkedinUrl(data.linkedinUrl ?? "");
    setGithubUrl(data.githubUrl ?? "");
    setMentorshipAvailable(data.mentorshipAvailable);
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

  function selectAvatar(file: File | null) {
    setAvatarFile(file);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function handleCropped(file: File) {
    selectAvatar(file);
    setPendingCropFile(null);
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
    // Unlike the fields above, a toggle has no "leave unset" state -- every
    // Step 1 save is an explicit statement of the current value.
    formData.append("mentorshipAvailable", String(mentorshipAvailable));

    setIsSubmitting(true);
    try {
      await apiPatchMultipart("/me/profile", formData);
      await loadProfile();
      selectAvatar(null);
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

  const avatarSrc = avatarPreview ?? profile.avatarUrl;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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

      {/* Hero: photo + identity, matching StudentProfile.tsx's profile card */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center sm:flex-row sm:text-left">
          <div className="relative shrink-0">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border bg-muted">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Your avatar" className="h-full w-full object-cover" />
              ) : (
                <UserRound className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <input
              ref={avatarInputRef}
              id="avatar"
              aria-label="Photo"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPendingCropFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1.5 text-primary-foreground shadow hover:bg-primary/90"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{profile.name ?? profile.email}</h2>
            {profile.jobTitle && (
              <p className="text-sm text-muted-foreground">
                {profile.jobTitle}
                {profile.company ? ` at ${profile.company}` : ""}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

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
            <form className="space-y-4" onSubmit={handleSaveStep1}>
              <Field title="Bio" htmlFor="bio">
                <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field title="Phone" htmlFor="phone">
                  <IconInput icon={Phone} id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field title="LinkedIn URL" htmlFor="linkedinUrl">
                  <IconInput
                    icon={Linkedin}
                    id="linkedinUrl"
                    type="url"
                    placeholder="https://linkedin.com/in/…"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                  />
                </Field>
                <Field title="GitHub URL" htmlFor="githubUrl">
                  <IconInput
                    icon={Github}
                    id="githubUrl"
                    type="url"
                    placeholder="https://github.com/…"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <GraduationCap className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Mentorship availability</p>
                  <label htmlFor="mentorshipAvailable" className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id="mentorshipAvailable"
                      checked={mentorshipAvailable}
                      onCheckedChange={(checked) => setMentorshipAvailable(checked === true)}
                    />
                    {mentorshipAvailable ? (
                      <span className="font-medium text-success">✅ Available for Mentorship</span>
                    ) : (
                      <span className="font-medium text-muted-foreground">❌ Not Available for Mentorship</span>
                    )}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    When available, students can send you mentorship requests from the alumni directory. You can
                    change this anytime -- it never affects referral requests tied to your job postings.
                  </p>
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
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyField label="College" value={profile.collegeName ?? "—"} />
            <ReadOnlyField label="Degree" value={profile.degreeName ?? "—"} />
            <ReadOnlyField label="Department" value={profile.departmentName ?? "—"} />
            <ReadOnlyField label="Graduation year" value={profile.graduationYear ?? "—"} />
            <Button type="button" variant="outline" onClick={() => setStep(3)} className="sm:col-span-2 sm:w-fit">
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
            <form className="space-y-4" onSubmit={handleSaveStep3}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field title="Company" htmlFor="company">
                  <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} />
                </Field>
                <Field title="Job title" htmlFor="jobTitle">
                  <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </Field>
                <Field title="Country" htmlFor="country">
                  <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} />
                </Field>
                <Field title="City" htmlFor="city">
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field title="Years of experience" htmlFor="yearsOfExperience">
                  <Input
                    id="yearsOfExperience"
                    type="number"
                    min="0"
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(e.target.value)}
                  />
                </Field>
                <Field title="Work email (optional)" htmlFor="workEmail">
                  <Input id="workEmail" type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} />
                </Field>
              </div>
              <Field title="Skills (comma-separated)" htmlFor="skills">
                <Input id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, SQL, Leadership" />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-success">{message}</p>}
              <Button type="submit" variant="brand" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save profile"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <ImageCropDialog
        open={pendingCropFile !== null}
        file={pendingCropFile}
        aspect={1}
        outputWidth={512}
        outputHeight={512}
        onCancel={() => setPendingCropFile(null)}
        onCropped={handleCropped}
      />
    </div>
  );
}
