import { PERMISSIONS } from "@introbuddy/shared";
import { CheckCircle2, Clock, MessageSquare, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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

const STATUS_META: Record<SentRequest["status"], { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground", icon: Clock },
  accepted: { label: "Accepted", className: "bg-success/10 text-success", icon: CheckCircle2 },
  declined: { label: "Declined", className: "bg-muted text-muted-foreground", icon: XCircle },
  expired: { label: "Expired", className: "bg-muted text-muted-foreground", icon: Clock },
  withdrawn: { label: "Withdrawn", className: "bg-muted text-muted-foreground", icon: XCircle },
};

function StatusBadge({ status }: { status: SentRequest["status"] }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

/** First name only, matching "Reply from Ananya" rather than the full name already shown in the header above. */
function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? "the alumnus";
}

function initials(name: string | null): string {
  if (!name) return "A";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

function ReplyFooter({ children }: { children: ReactNode }) {
  return <div className="mt-4 border-t pt-4">{children}</div>;
}

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
      <PageHeader title="My Requests" description="Mentorship and referral requests you've sent to alumni." />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't sent any requests yet.</p>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => (
            <Card key={req.id}>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-semibold">{req.alumnusName ?? "Alumnus"}</span>
                    <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="text-sm text-muted-foreground">
                      {req.alumnusCompany ? `${req.alumnusCompany} · ` : ""}
                      {req.type}
                      {req.opportunityTitle ? ` (${req.opportunityTitle})` : ""}
                    </span>
                  </div>
                  <StatusBadge status={req.status} />
                </div>

                <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm italic text-muted-foreground">
                  "{req.message}"
                </div>

                {req.responseMessage ? (
                  <ReplyFooter>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-primary-foreground">
                          {initials(req.alumnusName)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">Reply from {firstName(req.alumnusName)}</p>
                          <p className="text-sm text-muted-foreground">{req.responseMessage}</p>
                        </div>
                      </div>
                      <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                        Message
                        <MessageSquare className="h-4 w-4" />
                      </span>
                    </div>
                  </ReplyFooter>
                ) : req.status === "pending" ? (
                  <ReplyFooter>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm italic text-muted-foreground">Awaiting reply…</p>
                      <Button size="sm" variant="outline" onClick={() => handleWithdraw(req.id)}>
                        Withdraw
                      </Button>
                    </div>
                  </ReplyFooter>
                ) : req.status === "withdrawn" ? (
                  <ReplyFooter>
                    <p className="text-sm italic text-muted-foreground">You withdrew this request.</p>
                  </ReplyFooter>
                ) : req.status === "expired" ? (
                  <ReplyFooter>
                    <p className="text-sm italic text-muted-foreground">This request expired without a response.</p>
                  </ReplyFooter>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
