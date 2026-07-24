import { PERMISSIONS } from "@introbuddy/shared";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Button } from "../components/ui/button.js";
import { Card, CardContent } from "../components/ui/card.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet } from "../lib/apiClient.js";

interface AuditLogEntry {
  id: string;
  actorCollegeUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogResult {
  entries: AuditLogEntry[];
  total: number;
}

const PAGE_SIZE = 50;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function AuditLog() {
  const { can } = useSession();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!can(PERMISSIONS.AUDIT_LOG_VIEW)) return;
    apiGet<AuditLogResult>("/audit-log", { limit: PAGE_SIZE, offset }).then((result) => {
      setEntries(result.entries);
      setTotal(result.total);
    });
  }, [can, offset]);

  if (!can(PERMISSIONS.AUDIT_LOG_VIEW)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description={`${total} total ${total === 1 ? "entry" : "entries"}`} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">When</th>
                  <th className="pb-3 pr-4 font-medium">Action</th>
                  <th className="pb-3 pr-4 font-medium">Actor</th>
                  <th className="pb-3 pr-4 font-medium">Target</th>
                  <th className="pb-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatWhen(entry.createdAt)}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{entry.action}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className="block max-w-[12rem] truncate font-mono text-xs text-muted-foreground"
                        title={entry.actorCollegeUserId ?? undefined}
                      >
                        {entry.actorCollegeUserId ?? "—"}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      <span className="font-medium">{entry.targetType}</span>
                      {entry.targetId && (
                        <span className="block max-w-[12rem] truncate font-mono text-muted-foreground" title={entry.targetId}>
                          {entry.targetId}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-3 font-mono text-xs text-muted-foreground">
                      {entry.ipAddress ?? "—"}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No audit entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
            >
              Previous
            </Button>
            <span>
              {entries.length === 0 ? 0 : offset + 1}–{offset + entries.length} of {total}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
