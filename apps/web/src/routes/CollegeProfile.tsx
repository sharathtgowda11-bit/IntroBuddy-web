import { PERMISSIONS } from "@introbuddy/shared";
import { Building2, Camera, Info, Mail, MapPin } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Textarea } from "../components/ui/textarea.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatchMultipart, ApiError } from "../lib/apiClient.js";

interface CollegeProfile {
  name: string;
  slug: string;
  state: string | null;
  city: string | null;
  status: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-success/10 text-success",
  provisioning: "bg-brand-accent/10 text-brand-accent",
  suspended: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

export function CollegeProfile() {
  const { can } = useSession();
  const [profile, setProfile] = useState<CollegeProfile | null>(null);
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  function applyProfile(data: CollegeProfile) {
    setProfile(data);
    setDescription(data.description ?? "");
    setContactEmail(data.contactEmail ?? "");
    setContactPhone(data.contactPhone ?? "");
  }

  useEffect(() => {
    if (!can(PERMISSIONS.COLLEGE_EDIT_PROFILE)) return;
    apiGet<CollegeProfile>("/colleges/me").then((data) => {
      applyProfile(data);
    });
  }, [can]);

  if (!can(PERMISSIONS.COLLEGE_EDIT_PROFILE)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  if (!profile) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  function selectImage(
    file: File | null,
    setFile: (f: File | null) => void,
    setPreview: React.Dispatch<React.SetStateAction<string | null>>,
  ) {
    setFile(file);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  function clearSelections() {
    selectImage(null, setLogoFile, setLogoPreview);
    selectImage(null, setBannerFile, setBannerPreview);
  }

  function handleDiscard() {
    if (profile) applyProfile(profile);
    clearSelections();
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const formData = new FormData();
    if (description.trim()) formData.append("description", description.trim());
    if (contactEmail.trim()) formData.append("contactEmail", contactEmail.trim());
    if (contactPhone.trim()) formData.append("contactPhone", contactPhone.trim());
    if (logoFile) formData.append("logo", logoFile);
    if (bannerFile) formData.append("banner", bannerFile);

    setIsSubmitting(true);
    try {
      await apiPatchMultipart("/colleges/me/profile", formData);
      const updated = await apiGet<CollegeProfile>("/colleges/me");
      applyProfile(updated);
      clearSelections();
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const logoSrc = logoPreview ?? profile.logoUrl;
  const bannerSrc = bannerPreview ?? profile.bannerUrl;
  const location = [profile.city, profile.state].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Edit College Profile"
        description="Update your institution's branding and public information."
      />

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Branding hero: banner, logo, identity, and actions */}
        <Card className="overflow-hidden">
          <div className="relative h-40 w-full bg-gradient-to-br from-brand/25 via-brand/10 to-muted sm:h-52">
            {bannerSrc && <img src={bannerSrc} alt="College banner" className="h-full w-full object-cover" />}
            <input
              ref={bannerInputRef}
              id="banner"
              aria-label="Banner"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => selectImage(e.target.files?.[0] ?? null, setBannerFile, setBannerPreview)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute right-4 top-4 gap-2 shadow-sm"
              onClick={() => bannerInputRef.current?.click()}
            >
              <Camera className="h-4 w-4" />
              Edit Banner
            </Button>
          </div>

          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative -mt-16 shrink-0 sm:-mt-20">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border-4 border-card bg-muted shadow-sm">
                  {logoSrc ? (
                    <img src={logoSrc} alt="College logo" className="h-full w-full object-cover" />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  id="logo"
                  aria-label="Logo"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => selectImage(e.target.files?.[0] ?? null, setLogoFile, setLogoPreview)}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  aria-label="Edit logo"
                  className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1.5 text-primary-foreground shadow hover:bg-primary/90"
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{profile.name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {location || "—"}
                  </span>
                  <StatusBadge status={profile.status} />
                  <span className="font-mono text-xs">{profile.slug}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={handleDiscard} disabled={isSubmitting}>
                Discard
              </Button>
              <Button type="submit" variant="brand" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </Card>

        {profile.status === "provisioning" && (
          <div className="rounded-md border bg-brand-accent/5 px-4 py-3 text-sm text-muted-foreground">
            Upload both a logo and a banner to activate your college's public profile.
          </div>
        )}

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="h-4 w-4 text-brand" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Institution Full Name</Label>
              <Input id="name" value={profile.name} readOnly className="bg-muted/40" />
              <p className="text-xs text-muted-foreground">Set when the college was created and can't be changed here.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Institutional Description</Label>
              <Textarea id="description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Contact Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-brand" />
              Contact Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Primary Email Address</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Contact Phone Number</Label>
                <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-success">{message}</p>}
      </form>
    </div>
  );
}
