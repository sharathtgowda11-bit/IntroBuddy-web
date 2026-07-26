import { PERMISSIONS } from "@introbuddy/shared";
import { Linkedin, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Textarea } from "../components/ui/textarea.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPost, ApiError } from "../lib/apiClient.js";

interface Opportunity {
  id: string;
  type: "job" | "internship" | "referral";
  title: string;
  description: string | null;
  company: string | null;
  location: string | null;
  applyUrl: string | null;
  deadline: string | null;
  status: "open" | "closed" | "expired";
}

interface AlumniDirectoryDetail {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  company: string | null;
  jobTitle: string | null;
  city: string | null;
  country: string | null;
  linkedinUrl: string | null;
  bio: string | null;
  graduationYear: number | null;
  departmentName: string | null;
  opportunities: Opportunity[];
}

export function AlumniDirectoryProfile() {
  const { can } = useSession();
  const { id } = useParams();
  const [alumnus, setAlumnus] = useState<AlumniDirectoryDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<{ type: "mentorship" } | { type: "referral"; opportunityId: string } | null>(null);
  const [message, setMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendConfirmation, setSendConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (!can(PERMISSIONS.ALUMNI_DIRECTORY_VIEW) || !id) return;
    apiGet<AlumniDirectoryDetail>(`/alumni-directory/${id}`)
      .then(setAlumnus)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this profile."));
  }, [can, id]);

  if (!can(PERMISSIONS.ALUMNI_DIRECTORY_VIEW)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  if (loadError) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  if (!alumnus) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  async function handleSendRequest() {
    if (!activeForm || !alumnus) return;
    setSendError(null);
    try {
      await apiPost("/requests", {
        alumnusId: alumnus.id,
        type: activeForm.type,
        opportunityId: activeForm.type === "referral" ? activeForm.opportunityId : undefined,
        message,
      });
      setSendConfirmation("Request sent.");
      setActiveForm(null);
      setMessage("");
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={alumnus.name ?? "Alumnus"} description={[alumnus.departmentName, alumnus.graduationYear].filter(Boolean).join(" · ")} />

      <Card>
        <CardContent className="flex items-start gap-4 pt-6">
          {alumnus.avatarUrl ? (
            <img src={alumnus.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UserRound className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-medium">
              {alumnus.jobTitle ? `${alumnus.jobTitle}${alumnus.company ? ` at ${alumnus.company}` : ""}` : "—"}
            </p>
            <p className="text-sm text-muted-foreground">{[alumnus.city, alumnus.country].filter(Boolean).join(", ") || "—"}</p>
            {alumnus.bio && <p className="text-sm text-muted-foreground">{alumnus.bio}</p>}
            {alumnus.linkedinUrl && (
              <a
                href={alumnus.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1.5 text-sm text-brand hover:underline"
              >
                <Linkedin className="h-4 w-4" />
                LinkedIn
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {sendConfirmation ? (
        <p className="text-sm text-success">{sendConfirmation}</p>
      ) : activeForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{activeForm.type === "mentorship" ? "Request mentorship" : "Request a referral"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Introduce yourself and what you're asking for" />
            {sendError && <p className="text-sm text-destructive">{sendError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSendRequest} disabled={!message.trim()}>
                Send request
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveForm(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setActiveForm({ type: "mentorship" })}>Request mentorship</Button>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Open opportunities</CardTitle>
          <CardDescription>Jobs, internships, and referrals {alumnus.name ?? "this alumnus"} has posted.</CardDescription>
        </CardHeader>
        <CardContent>
          {alumnus.opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open opportunities right now.</p>
          ) : (
            <ul className="space-y-3">
              {alumnus.opportunities.map((op) => (
                <li key={op.id} className="space-y-2 rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{op.title}</p>
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                      {op.type}
                    </span>
                  </div>
                  {op.description && <p className="text-muted-foreground">{op.description}</p>}
                  <p className="text-muted-foreground">
                    {[op.company, op.location].filter(Boolean).join(" · ") || "—"}
                    {op.deadline ? ` · Deadline ${op.deadline}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {op.applyUrl && (
                      <Button asChild size="sm" variant="outline">
                        <a href={op.applyUrl} target="_blank" rel="noreferrer">
                          Apply
                        </a>
                      </Button>
                    )}
                    {op.type === "referral" && !activeForm && !sendConfirmation && (
                      <Button size="sm" onClick={() => setActiveForm({ type: "referral", opportunityId: op.id })}>
                        Request referral
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
