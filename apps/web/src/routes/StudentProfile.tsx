import { PERMISSIONS, type CertificationCreateInput } from "@introbuddy/shared";
import { FileText, Plus, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { Textarea } from "../components/ui/textarea.js";
import { useSession } from "../context/sessionContext.js";
import { apiDelete, apiGet, apiPatchMultipart, apiPost, ApiError } from "../lib/apiClient.js";

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
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
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newCert, setNewCert] = useState<NewCertification>(emptyCertification);
  const [certError, setCertError] = useState<string | null>(null);

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
      setAvatarFile(null);
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

  return (
    <div className="max-w-2xl space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Everything alumni will see when they view your profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-8" onSubmit={handleSubmit}>
            <Section title="Photo & résumé">
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
                <Label htmlFor="resume">Resume (PDF)</Label>
                {profile.resumeUrl && (
                  <a
                    href={profile.resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-fit items-center gap-1.5 text-sm text-brand hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    View current resume
                  </a>
                )}
                <Input
                  id="resume"
                  type="file"
                  accept="application/pdf"
                  className="max-w-xs"
                  onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </Section>

            <Section title="Links">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                  <Input id="linkedinUrl" type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="githubUrl">GitHub URL</Label>
                  <Input id="githubUrl" type="url" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
                </div>
              </div>
            </Section>

            <Section title="About you">
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills</Label>
                <Textarea id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interests">Interests</Label>
                <Textarea id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="achievements">Achievements</Label>
                <Textarea id="achievements" value={achievements} onChange={(e) => setAchievements(e.target.value)} />
              </div>
            </Section>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-success">{message}</p>}
            <Button type="submit" variant="brand" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

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
    </div>
  );
}
