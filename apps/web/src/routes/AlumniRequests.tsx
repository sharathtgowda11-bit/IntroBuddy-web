import { PERMISSIONS } from "@introbuddy/shared";
import { CheckCircle2, Clock, Search, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Select } from "../components/ui/select.js";
import { Textarea } from "../components/ui/textarea.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet, apiPatch, ApiError } from "../lib/apiClient.js";

interface ReceivedRequest {
  id: string;
  studentName: string | null;
  studentEmail: string;
  type: "mentorship" | "referral";
  opportunityTitle: string | null;
  message: string;
  status: "pending" | "accepted" | "declined" | "expired" | "withdrawn";
  responseMessage: string | null;
  createdAt: string;
}

type StatusTab = "all" | "pending" | "accepted" | "declined";
type TypeFilter = "all" | "mentorship" | "referral";
type SortOrder = "newest" | "oldest" | "status";

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

const STATUS_META: Record<ReceivedRequest["status"], { label: string; className: string; icon: typeof Clock }> = {
  pending: { label: "Pending", className: "bg-brand-accent/10 text-brand-accent", icon: Clock },
  accepted: { label: "Accepted", className: "bg-success/10 text-success", icon: CheckCircle2 },
  declined: { label: "Declined", className: "bg-muted text-muted-foreground", icon: XCircle },
  expired: { label: "Expired", className: "bg-muted text-muted-foreground", icon: Clock },
  withdrawn: { label: "Withdrawn", className: "bg-muted text-muted-foreground", icon: XCircle },
};

// Ranks pending first (needs action), then accepted, then everything else --
// used only by the "Status" sort option.
const STATUS_RANK: Record<ReceivedRequest["status"], number> = {
  pending: 0,
  accepted: 1,
  declined: 2,
  expired: 3,
  withdrawn: 4,
};

const PAGE_SIZE = 10;

function StatusBadge({ status }: { status: ReceivedRequest["status"] }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Dedicated request-management page for alumni, split out of
 * AlumniDashboard.tsx so the dashboard stays a glanceable summary. Reuses
 * GET /requests/received and PATCH /requests/:id/respond verbatim --
 * filtering/searching/sorting/paging all happen client-side over that one
 * fetch (see plan: this is one alumnus's own received requests, not a
 * college-wide list, so the volume never justifies new backend params).
 */
export function AlumniRequests() {
  const { can, session } = useSession();
  const hasAccess = can(PERMISSIONS.REQUEST_RESPOND) && session?.role === "alumni";

  const [requests, setRequests] = useState<ReceivedRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOrder>("newest");
  const [offset, setOffset] = useState(0);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseMessage, setResponseMessage] = useState("");

  async function loadRequests() {
    try {
      const result = await apiGet<{ requests: ReceivedRequest[] }>("/requests/received");
      setRequests(result.requests);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load requests. Please try again.");
    }
  }

  useEffect(() => {
    if (!hasAccess) return;
    apiGet<{ requests: ReceivedRequest[] }>("/requests/received")
      .then((result) => {
        setRequests(result.requests);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load requests. Please try again."));
  }, [hasAccess]);

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      accepted: requests.filter((r) => r.status === "accepted").length,
      declined: requests.filter((r) => r.status === "declined").length,
    }),
    [requests],
  );

  const filteredAndSorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    let result = requests.filter((r) => {
      if (statusTab !== "all" && r.status !== statusTab) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (term && !(r.studentName ?? r.studentEmail).toLowerCase().includes(term)) return false;
      return true;
    });

    result = [...result].sort((a, b) => {
      if (sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    });

    return result;
  }, [requests, statusTab, typeFilter, search, sort]);

  const total = filteredAndSorted.length;
  const page = filteredAndSorted.slice(offset, offset + PAGE_SIZE);

  if (!hasAccess) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  function changeStatusTab(tab: StatusTab) {
    setStatusTab(tab);
    setOffset(0);
  }

  async function handleRespond(id: string, status: "accepted" | "declined") {
    await apiPatch(`/requests/${id}/respond`, { status, responseMessage: responseMessage.trim() || undefined });
    setRespondingId(null);
    setResponseMessage("");
    await loadRequests();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Requests" description="Mentorship and referral requests students have sent you." />

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => changeStatusTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              statusTab === key ? "bg-brand text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[200px] flex-1 space-y-2">
            <Label htmlFor="requestSearch">Search by student name</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="requestSearch"
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
                placeholder="Search…"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="typeFilter">Type</Label>
            <Select
              id="typeFilter"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as TypeFilter);
                setOffset(0);
              }}
            >
              <option value="all">All types</option>
              <option value="mentorship">Mentorship</option>
              <option value="referral">Referral</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sortOrder">Sort by</Label>
            <Select id="sortOrder" value={sort} onChange={(e) => setSort(e.target.value as SortOrder)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="status">Status</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {page.length === 0 ? (
        <p className="text-sm text-muted-foreground">No requests match your filters.</p>
      ) : (
        <div className="space-y-3">
          {page.map((req) => (
            <Card key={req.id}>
              <CardContent className="space-y-3 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{req.studentName ?? req.studentEmail}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="capitalize">{req.type}</span>
                      {req.opportunityTitle ? ` — ${req.opportunityTitle}` : ""} · {formatDateTime(req.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={req.status} />
                </div>

                <div className="rounded-md border bg-muted/40 p-3 text-sm italic text-muted-foreground">"{req.message}"</div>

                {req.responseMessage && <p className="text-sm italic text-muted-foreground">Your reply: {req.responseMessage}</p>}

                {req.status === "pending" &&
                  (respondingId === req.id ? (
                    <div className="space-y-2 border-t pt-3">
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
                    <div className="border-t pt-3">
                      <Button size="sm" variant="outline" onClick={() => setRespondingId(req.id)}>
                        Respond
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}>
            Previous
          </Button>
          <span>
            {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((prev) => prev + PAGE_SIZE)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
