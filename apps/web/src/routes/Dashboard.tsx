import { PERMISSIONS } from "@introbuddy/shared";
import { BadgeCheck, Briefcase, Clock, UserCheck, Users, UserX, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet } from "../lib/apiClient.js";

interface DashboardStats {
  totalStudents: number;
  activeCount: number;
  invitedCount: number;
  deactivatedCount: number;
  profileCompleteCount: number;
  // Phase 2: merged into the same GET /dashboard response.
  totalAlumni: number;
  activeAlumniCount: number;
  invitedAlumniCount: number;
  deactivatedAlumniCount: number;
  alumniProfileCompleteCount: number;
  alumniByCompany: { company: string; count: number }[];
}

const STUDENT_TILES: { key: keyof DashboardStats; label: string; icon: LucideIcon; tint: string }[] = [
  { key: "totalStudents", label: "Total students", icon: Users, tint: "bg-brand/10 text-brand" },
  { key: "activeCount", label: "Active", icon: UserCheck, tint: "bg-success/10 text-success" },
  { key: "invitedCount", label: "Invited", icon: Clock, tint: "bg-brand-accent/10 text-brand-accent" },
  { key: "deactivatedCount", label: "Deactivated", icon: UserX, tint: "bg-muted text-muted-foreground" },
  { key: "profileCompleteCount", label: "Profile complete", icon: BadgeCheck, tint: "bg-brand/10 text-brand" },
];

const ALUMNI_TILES: { key: keyof DashboardStats; label: string; icon: LucideIcon; tint: string }[] = [
  { key: "totalAlumni", label: "Total alumni", icon: Users, tint: "bg-brand/10 text-brand" },
  { key: "activeAlumniCount", label: "Active", icon: UserCheck, tint: "bg-success/10 text-success" },
  { key: "invitedAlumniCount", label: "Invited", icon: Clock, tint: "bg-brand-accent/10 text-brand-accent" },
  { key: "deactivatedAlumniCount", label: "Deactivated", icon: UserX, tint: "bg-muted text-muted-foreground" },
  { key: "alumniProfileCompleteCount", label: "Profile complete", icon: BadgeCheck, tint: "bg-brand/10 text-brand" },
];

function StatTiles({ stats, tiles }: { stats: DashboardStats; tiles: typeof STUDENT_TILES }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      {tiles.map(({ key, label, icon: Icon, tint }) => (
        <Card key={key}>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardDescription className="text-xs font-medium uppercase tracking-wide">{label}</CardDescription>
              <CardTitle className="text-3xl">{stats[key] as number}</CardTitle>
            </div>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
              <Icon className="h-5 w-5" />
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function Dashboard() {
  const { can, session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  // DASHBOARD_VIEW is held by both college_admin and super_admin, but this
  // screen's tenant-scoped stats only make sense for college_admin --
  // super_admin has its own PlatformDashboard at /admin/dashboard.
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
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Students</h2>
            <StatTiles stats={stats} tiles={STUDENT_TILES} />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Alumni</h2>
            <StatTiles stats={stats} tiles={ALUMNI_TILES} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Briefcase className="h-4 w-4 text-brand" />
                Alumni by company
              </CardTitle>
              <CardDescription>Where your college's alumni currently work, by profile-reported company.</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.alumniByCompany.length === 0 ? (
                <p className="text-sm text-muted-foreground">No alumni have added a company yet.</p>
              ) : (
                <ul className="divide-y">
                  {stats.alumniByCompany.map(({ company, count }) => (
                    <li key={company} className="flex items-center justify-between py-2 text-sm">
                      <span>{company}</span>
                      <span className="font-medium text-muted-foreground">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
