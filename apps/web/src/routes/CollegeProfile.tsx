import { PERMISSIONS } from "@introbuddy/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
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

export function CollegeProfile() {
  const { can } = useSession();
  const [profile, setProfile] = useState<CollegeProfile | null>(null);
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!can(PERMISSIONS.COLLEGE_EDIT_PROFILE)) return;
    apiGet<CollegeProfile>("/colleges/me").then((data) => {
      setProfile(data);
      setDescription(data.description ?? "");
      setContactEmail(data.contactEmail ?? "");
      setContactPhone(data.contactPhone ?? "");
    });
  }, [can]);

  if (!can(PERMISSIONS.COLLEGE_EDIT_PROFILE)) {
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
    if (description.trim()) formData.append("description", description.trim());
    if (contactEmail.trim()) formData.append("contactEmail", contactEmail.trim());
    if (contactPhone.trim()) formData.append("contactPhone", contactPhone.trim());
    if (logoFile) formData.append("logo", logoFile);
    if (bannerFile) formData.append("banner", bannerFile);

    setIsSubmitting(true);
    try {
      await apiPatchMultipart("/colleges/me/profile", formData);
      const updated = await apiGet<CollegeProfile>("/colleges/me");
      setProfile(updated);
      setLogoFile(null);
      setBannerFile(null);
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>College profile</CardTitle>
        <CardDescription>
          {profile.name} ({profile.slug}) — {profile.city}, {profile.state} — status: {profile.status}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {profile.status === "provisioning" && (
          <p className="text-sm text-muted-foreground">
            Upload both a logo and a banner to activate your college's profile.
          </p>
        )}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            {profile.logoUrl && <img src={profile.logoUrl} alt="Current logo" className="h-16 w-16 rounded object-cover" />}
            <Input id="logo" type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="banner">Banner</Label>
            {profile.bannerUrl && (
              <img src={profile.bannerUrl} alt="Current banner" className="h-16 w-full rounded object-cover" />
            )}
            <Input id="banner" type="file" accept="image/*" onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPhone">Contact phone</Label>
            <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {message && <p className="text-sm text-success">{message}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
