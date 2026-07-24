import { PERMISSIONS } from "@introbuddy/shared";
import { BadgeCheck, Clock, UserCheck, Users, UserX, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet } from "../lib/apiClient.js";

interface DashboardStats {
  totalStudents: number;
  activeCount: number;
  invitedCount: number;
  deactivatedCount: number;
  profileCompleteCount: number;
}

const TILES: { key: keyof DashboardStats; label: string; icon: LucideIcon; tint: string }[] = [
  { key: "totalStudents", label: "Total students", icon: Users, tint: "bg-brand/10 text-brand" },
  { key: "activeCount", label: "Active", icon: UserCheck, tint: "bg-success/10 text-success" },
  { key: "invitedCount", label: "Invited", icon: Clock, tint: "bg-brand-accent/10 text-brand-accent" },
  { key: "deactivatedCount", label: "Deactivated", icon: UserX, tint: "bg-muted text-muted-foreground" },
  { key: "profileCompleteCount", label: "Profile complete", icon: BadgeCheck, tint: "bg-brand/10 text-brand" },
];

export function Dashboard() {
  const { can, session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  // DASHBOARD_VIEW is held by both college_admin and super_admin, but this
  // screen's tenant-scoped student stats only make sense for college_admin
  // -- super_admin has its own PlatformDashboard at /admin/dashboard.
  const hasAccess = can(PERMISSIONS.DASHBOARD_VIEW) && session?.role === "college_admin";

  useEffect(() => {
    if (!hasAccess) return;
    apiGet<DashboardStats>("/dashboard").then((data) => {
      setStats(data);
    });
  }, [hasAccess]);

  if (!hasAccess) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          <>
            Signed in as <span className="font-medium text-foreground">{session?.email}</span>
            <span className="ml-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium">
              {session?.tenantSlug ?? "college_admin"}
            </span>
          </>
        }
      />

      {!stats ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
          {TILES.map(({ key, label, icon: Icon, tint }) => (
            <Card key={key}>
              <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardDescription className="text-xs font-medium uppercase tracking-wide">{label}</CardDescription>
                  <CardTitle className="text-3xl">{stats[key]}</CardTitle>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
