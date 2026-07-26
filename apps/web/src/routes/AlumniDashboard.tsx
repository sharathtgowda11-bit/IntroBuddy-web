import { PERMISSIONS, type OpportunityCreateInput } from "@introbuddy/shared";
import { Plus, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { Textarea } from "../components/ui/textarea.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatch, apiPost, ApiError } from "../lib/apiClient.js";

interface AlumniProfileSummary {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  company: string | null;
  jobTitle: string | null;
  profileComplete: boolean;
}

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

interface ReceivedRequest {
  id: string;
  studentName: string | null;
  studentEmail: string;
  type: "mentorship" | "referral";
  opportunityTitle: string | null;
  message: string;
  status: "pending" | "accepted" | "declined" | "expired" | "withdrawn";
  responseMessage: string | null;
}

const emptyOpportunity: OpportunityCreateInput = {
  type: "job",
  title: "",
  description: "",
  company: "",
  location: "",
  applyUrl: "",
  deadline: "",
};

export function AlumniDashboard() {
  const { can, session } = useSession();
  const hasAccess = can(PERMISSIONS.OPPORTUNITY_MANAGE) && session?.role === "alumni";

  const [profile, setProfile] = useState<AlumniProfileSummary | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [requests, setRequests] = useState<ReceivedRequest[]>([]);
  const [showPostForm, setShowPostForm] = useState(false);
  const [newOpportunity, setNewOpportunity] = useState<OpportunityCreateInput>(emptyOpportunity);
  const [postError, setPostError] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadAll() {
    try {
      const [profileData, opportunitiesData, requestsData] = await Promise.all([
        apiGet<AlumniProfileSummary>("/me/profile"),
        apiGet<{ opportunities: Opportunity[] }>("/opportunities/mine"),
        apiGet<{ requests: ReceivedRequest[] }>("/requests/received"),
      ]);
      setProfile(profileData);
      setOpportunities(opportunitiesData.opportunities);
      setRequests(requestsData.requests);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load your dashboard. Please try again.");
    }
  }

  useEffect(() => {
    if (!hasAccess) return;
    Promise.all([
      apiGet<AlumniProfileSummary>("/me/profile"),
      apiGet<{ opportunities: Opportunity[] }>("/opportunities/mine"),
      apiGet<{ requests: ReceivedRequest[] }>("/requests/received"),
    ])
      .then(([profileData, opportunitiesData, requestsData]) => {
        setProfile(profileData);
        setOpportunities(opportunitiesData.opportunities);
        setRequests(requestsData.requests);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load your dashboard. Please try again."));
  }, [hasAccess]);

  if (!hasAccess) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  if (loadError && !profile) {
    return <p className="text-sm text-destructive">{loadError}</p>;
  }

  async function handlePostOpportunity(event: FormEvent) {
    event.preventDefault();
    setPostError(null);
    try {
      const body: OpportunityCreateInput = {
        type: newOpportunity.type,
        title: newOpportunity.title,
        description: newOpportunity.description || undefined,
        company: newOpportunity.company || undefined,
        location: newOpportunity.location || undefined,
        applyUrl: newOpportunity.applyUrl || undefined,
        deadline: newOpportunity.deadline || undefined,
      };
      await apiPost("/opportunities", body);
      setNewOpportunity(emptyOpportunity);
      setShowPostForm(false);
      await loadAll();
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleToggleOpportunityStatus(opportunity: Opportunity) {
    const nextStatus = opportunity.status === "open" ? "closed" : "open";
    await apiPatch(`/opportunities/${opportunity.id}`, { status: nextStatus });
    await loadAll();
  }

  async function handleRespond(id: string, status: "accepted" | "declined") {
    await apiPatch(`/requests/${id}/respond`, { status, responseMessage: responseMessage.trim() || undefined });
    setRespondingId(null);
    setResponseMessage("");
    await loadAll();
  }

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const pastRequests = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Your profile, postings, and requests from students at a glance." />

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {profile && !profile.profileComplete && (
        <div className="rounded-md border bg-brand-accent/5 px-4 py-3 text-sm text-muted-foreground">
          Your profile is incomplete.{" "}
          <Link to="/alumni/profile" className="font-medium text-brand hover:underline">
            Finish it
          </Link>{" "}
          to appear in the student directory and post opportunities.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Your profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt="Your avatar" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserRound className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{profile?.name ?? profile?.email}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {profile?.jobTitle ? `${profile.jobTitle}${profile.company ? ` at ${profile.company}` : ""}` : "—"}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/alumni/profile">Edit profile</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Your postings</CardTitle>
              <CardDescription>Jobs, internships, and referrals you've shared with students.</CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowPostForm((prev) => !prev)}>
              <Plus className="h-4 w-4" />
              Post opportunity
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {showPostForm && (
              <form className="space-y-3 rounded-md border p-4" onSubmit={handlePostOpportunity}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="opType">Type</Label>
                    <Select
                      id="opType"
                      value={newOpportunity.type}
                      onChange={(e) => setNewOpportunity((prev) => ({ ...prev, type: e.target.value as OpportunityCreateInput["type"] }))}
                    >
                      <option value="job">Job</option>
                      <option value="internship">Internship</option>
                      <option value="referral">Referral</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="opTitle">Title</Label>
                    <Input
                      id="opTitle"
                      value={newOpportunity.title}
                      onChange={(e) => setNewOpportunity((prev) => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="opCompany">Company</Label>
                    <Input
                      id="opCompany"
                      value={newOpportunity.company ?? ""}
                      onChange={(e) => setNewOpportunity((prev) => ({ ...prev, company: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="opLocation">Location</Label>
                    <Input
                      id="opLocation"
                      value={newOpportunity.location ?? ""}
                      onChange={(e) => setNewOpportunity((prev) => ({ ...prev, location: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="opApplyUrl">Apply URL</Label>
                    <Input
                      id="opApplyUrl"
                      type="url"
                      value={newOpportunity.applyUrl ?? ""}
                      onChange={(e) => setNewOpportunity((prev) => ({ ...prev, applyUrl: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="opDeadline">Deadline</Label>
                    <Input
                      id="opDeadline"
                      type="date"
                      value={newOpportunity.deadline ?? ""}
                      onChange={(e) => setNewOpportunity((prev) => ({ ...prev, deadline: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="opDescription">Description</Label>
                  <Textarea
                    id="opDescription"
                    value={newOpportunity.description ?? ""}
                    onChange={(e) => setNewOpportunity((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                {postError && <p className="text-sm text-destructive">{postError}</p>}
                <Button type="submit" size="sm">
                  Post
                </Button>
              </form>
            )}

            {opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven't posted anything yet.</p>
            ) : (
              <ul className="space-y-2">
                {opportunities.map((op) => (
                  <li key={op.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{op.title}</p>
                        <span className="inline-flex shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                          {op.type}
                        </span>
                        <span
                          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            op.status === "open" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {op.status}
                        </span>
                      </div>
                      <p className="truncate text-muted-foreground">{op.company ?? "—"}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleToggleOpportunityStatus(op)}>
                      {op.status === "open" ? "Close" : "Reopen"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requests you've received</CardTitle>
          <CardDescription>{pendingRequests.length} pending</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="space-y-2">
              {[...pendingRequests, ...pastRequests].map((req) => (
                <li key={req.id} className="space-y-2 rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">{req.studentName ?? req.studentEmail}</span>{" "}
                      <span className="text-muted-foreground">
                        — {req.type}
                        {req.opportunityTitle ? ` (${req.opportunityTitle})` : ""}
                      </span>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        req.status === "pending"
                          ? "bg-brand-accent/10 text-brand-accent"
                          : req.status === "accepted"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{req.message}</p>
                  {req.responseMessage && <p className="italic text-muted-foreground">Your reply: {req.responseMessage}</p>}

                  {req.status === "pending" &&
                    (respondingId === req.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={responseMessage}
                          onChange={(e) => setResponseMessage(e.target.value)}
                          placeholder="Optional reply message"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleRespond(req.id, "accepted")}>
                            Accept
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleRespond(req.id, "declined")}>
                            Decline
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRespondingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setRespondingId(req.id)}>
                        Respond
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
