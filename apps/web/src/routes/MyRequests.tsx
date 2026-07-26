import { PERMISSIONS } from "@introbuddy/shared";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatch, ApiError } from "../lib/apiClient.js";

interface SentRequest {
  id: string;
  alumnusName: string | null;
  alumnusCompany: string | null;
  type: "mentorship" | "referral";
  opportunityTitle: string | null;
  message: string;
  status: "pending" | "accepted" | "declined" | "expired" | "withdrawn";
  responseMessage: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-brand-accent/10 text-brand-accent",
  accepted: "bg-success/10 text-success",
  declined: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
};

export function MyRequests() {
  const { can } = useSession();
  const [requests, setRequests] = useState<SentRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadRequests() {
    try {
      const result = await apiGet<{ requests: SentRequest[] }>("/requests/sent");
      setRequests(result.requests);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your requests. Please try again.");
    }
  }

  useEffect(() => {
    if (!can(PERMISSIONS.REQUEST_SEND)) return;
    apiGet<{ requests: SentRequest[] }>("/requests/sent")
      .then((result) => {
        setRequests(result.requests);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your requests. Please try again."));
  }, [can]);

  if (!can(PERMISSIONS.REQUEST_SEND)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  async function handleWithdraw(id: string) {
    await apiPatch(`/requests/${id}/withdraw`, {});
    await loadRequests();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My requests" description="Mentorship and referral requests you've sent to alumni." />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't sent any requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="space-y-2 pt-6 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{req.alumnusName ?? "Alumnus"}</span>
                    {req.alumnusCompany && <span className="text-muted-foreground"> — {req.alumnusCompany}</span>}
                    <span className="text-muted-foreground">
                      {" "}
                      · {req.type}
                      {req.opportunityTitle ? ` (${req.opportunityTitle})` : ""}
                    </span>
                  </div>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[req.status] ?? "bg-muted text-muted-foreground"}`}>
                    {req.status}
                  </span>
                </div>
                <p className="text-muted-foreground">{req.message}</p>
                {req.responseMessage && <p className="italic text-muted-foreground">Reply: {req.responseMessage}</p>}
                {req.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => handleWithdraw(req.id)}>
                    Withdraw
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
