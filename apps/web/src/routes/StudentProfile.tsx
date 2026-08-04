import { PERMISSIONS, type CertificationCreateInput } from "@introbuddy/shared";
import { Camera, FileText, Github, Linkedin, Mail, Plus, UploadCloud, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { ImageCropDialog } from "../components/ImageCropDialog.js";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { Textarea } from "../components/ui/textarea.js";
import { useSession } from "../context/sessionContext.js";
import { apiDelete, apiGet, apiPatchMultipart, apiPost, ApiError } from "../lib/apiClient.js";
import { cn } from "../lib/utils.js";

interface Certification {
  id: string;
  name: string;
  type: "workshop" | "internship" | "course";
  issuingOrganisation: string;
  date: string | null;
  certificateUrl: string | null;
}

interface Profile {
  name: string | null;
  usn: string;
  email: string;
  graduationYear: number;
  degreeName: string;
  departmentName: string;
  avatarUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  resumeUrl: string | null;
  bio: string | null;
  skills: string | null;
  interests: string | null;
  achievements: string | null;
  profileComplete: boolean;
  certifications: Certification[];
}

type NewCertification = { name: string; type: Certification["type"]; issuingOrganisation: string; date: string; certificateUrl: string };

const emptyCertification: NewCertification = { name: "", type: "workshop", issuingOrganisation: "", date: "", certificateUrl: "" };

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

/** Icon-prefixed input, matching the reference mockup's Contact Details rows. */
function IconInput({ icon: Icon, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon: typeof Mail }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("pl-9", className)} {...props} />
    </div>
  );
}

export function StudentProfile() {
  const { can } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [interests, setInterests] = useState("");
  const [achievements, setAchievements] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCert, setNewCert] = useState<NewCertification>(emptyCertification);
  const [certError, setCertError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);

  function applyProfile(data: Profile) {
    setProfile(data);
    setLinkedinUrl(data.linkedinUrl ?? "");
    setGithubUrl(data.githubUrl ?? "");
    setBio(data.bio ?? "");
    setSkills(data.skills ?? "");
    setInterests(data.interests ?? "");
    setAchievements(data.achievements ?? "");
  }

  async function loadProfile() {
    const data = await apiGet<Profile>("/me/profile");
    applyProfile(data);
  }

  useEffect(() => {
    if (!can(PERMISSIONS.PROFILE_EDIT_OWN)) return;
    apiGet<Profile>("/me/profile").then((data) => {
      applyProfile(data);
    });
  }, [can]);

  if (!can(PERMISSIONS.PROFILE_EDIT_OWN)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const formData = new FormData();
    if (linkedinUrl.trim()) formData.append("linkedinUrl", linkedinUrl.trim());
    if (githubUrl.trim()) formData.append("githubUrl", githubUrl.trim());
    if (bio.trim()) formData.append("bio", bio.trim());
    if (skills.trim()) formData.append("skills", skills.trim());
    if (interests.trim()) formData.append("interests", interests.trim());
    if (achievements.trim()) formData.append("achievements", achievements.trim());
    if (avatarFile) formData.append("avatar", avatarFile);
    if (resumeFile) formData.append("resume", resumeFile);

    setIsSubmitting(true);
    try {
      await apiPatchMultipart("/me/profile", formData);
      await loadProfile();
      selectAvatar(null);
      setResumeFile(null);
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddCertification(event: FormEvent) {
    event.preventDefault();
    setCertError(null);
    const body: CertificationCreateInput = {
      name: newCert.name,
      type: newCert.type,
      issuingOrganisation: newCert.issuingOrganisation,
      date: newCert.date || undefined,
      certificateUrl: newCert.certificateUrl || undefined,
    };
    try {
      await apiPost("/me/certifications", body);
      await loadProfile();
      setNewCert(emptyCertification);
    } catch (err) {
      setCertError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleDeleteCertification(id: string) {
    await apiDelete(`/me/certifications/${id}`);
    await loadProfile();
  }

  const avatarSrc = avatarPreview ?? profile.avatarUrl;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="My profile"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {profile.usn} — {profile.degreeName}, {profile.departmentName}, class of {profile.graduationYear}
            </span>
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
          Add a photo and your LinkedIn URL to complete your profile.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Hero: photo + identity, mirrors the reference mockup's profile card */}
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
                  <p className="text-sm text-muted-foreground">
                    {profile.degreeName} · {profile.departmentName}, class of {profile.graduationYear}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>About you</CardTitle>
                <CardDescription>Everything alumni will see when they view your profile.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field title="Bio" htmlFor="bio">
                  <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
                </Field>
                <Field title="Skills" htmlFor="skills">
                  <Textarea id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
                </Field>
                <Field title="Interests" htmlFor="interests">
                  <Textarea id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} />
                </Field>
                <Field title="Achievements" htmlFor="achievements">
                  <Textarea id="achievements" value={achievements} onChange={(e) => setAchievements(e.target.value)} />
                </Field>
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save profile"}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-success">{message}</p>}
            </div>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field title="Email" htmlFor="email">
                  <IconInput icon={Mail} id="email" value={profile.email} readOnly className="bg-muted/40" />
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resume</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.resumeUrl ? (
                  <a
                    href={profile.resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-accent"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-brand" />
                    <span className="min-w-0 flex-1 truncate">View current resume</span>
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">No resume uploaded yet.</p>
                )}
                {resumeFile && <p className="truncate text-xs text-muted-foreground">Selected: {resumeFile.name}</p>}
                <input
                  ref={resumeInputRef}
                  id="resume"
                  aria-label="Resume (PDF)"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                />
                <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => resumeInputRef.current?.click()}>
                  <UploadCloud className="h-4 w-4" />
                  {profile.resumeUrl ? "Replace résumé" : "Upload résumé"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Certifications</CardTitle>
          <CardDescription>Workshops, internships, and courses you've completed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {profile.certifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No certifications yet.</p>
          ) : (
            <ul className="space-y-2">
              {profile.certifications.map((cert) => (
                <li key={cert.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{cert.name}</p>
                      <span className="inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {cert.type}
                      </span>
                    </div>
                    <p className="truncate text-muted-foreground">
                      {cert.issuingOrganisation}
                      {cert.date ? ` — ${cert.date}` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteCertification(cert.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form className="space-y-4 border-t pt-5" onSubmit={handleAddCertification}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a certification</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="certName">Name</Label>
                <Input
                  id="certName"
                  value={newCert.name}
                  onChange={(e) => setNewCert((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certType">Type</Label>
                <Select
                  id="certType"
                  value={newCert.type}
                  onChange={(e) => setNewCert((prev) => ({ ...prev, type: e.target.value as Certification["type"] }))}
                >
                  <option value="workshop">Workshop</option>
                  <option value="internship">Internship</option>
                  <option value="course">Course</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="certOrg">Issuing organisation</Label>
                <Input
                  id="certOrg"
                  value={newCert.issuingOrganisation}
                  onChange={(e) => setNewCert((prev) => ({ ...prev, issuingOrganisation: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certDate">Date</Label>
                <Input
                  id="certDate"
                  type="date"
                  value={newCert.date}
                  onChange={(e) => setNewCert((prev) => ({ ...prev, date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="certUrl">Certificate URL</Label>
              <Input
                id="certUrl"
                type="url"
                value={newCert.certificateUrl}
                onChange={(e) => setNewCert((prev) => ({ ...prev, certificateUrl: e.target.value }))}
              />
            </div>
            {certError && <p className="text-sm text-destructive">{certError}</p>}
            <Button type="submit" variant="outline">
              <Plus className="h-4 w-4" />
              Add certification
            </Button>
          </form>
        </CardContent>
      </Card>

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
