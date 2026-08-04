import { PERMISSIONS } from "@introbuddy/shared";
import { Building2, CheckCircle2, Clock, GraduationCap, Search, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Select } from "../components/ui/select.js";
import { useSession } from "../context/sessionContext.js";
import { apiGet } from "../lib/apiClient.js";

interface College {
  id: string;
  slug: string;
  name: string;
  status: "provisioning" | "active" | "suspended";
  city: string | null;
  state: string | null;
  totalStudents: number;
  activeStudents: number;
  totalAlumni: number;
}

const STATUS_STYLES: Record<College["status"], string> = {
  active: "bg-success/10 text-success",
  provisioning: "bg-brand-accent/10 text-brand-accent",
  suspended: "bg-muted text-muted-foreground",
};

function StatusBadge({ status }: { status: College["status"] }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

export function PlatformDashboard() {
  const { can, session } = useSession();
  const [colleges, setColleges] = useState<College[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (!can(PERMISSIONS.COLLEGE_VIEW_ALL)) return;
    apiGet<{ colleges: College[] }>("/colleges").then((data) => {
      setColleges(data.colleges);
    });
  }, [can]);

  if (!can(PERMISSIONS.COLLEGE_VIEW_ALL)) {
    return <p className="text-muted-foreground">You don't have access to this page.</p>;
  }

  if (!colleges) {
    return <p className="text-muted-foreground">Loading…</p>;
  }

  const totalColleges = colleges.length;
  const activeColleges = colleges.filter((c) => c.status === "active").length;
  const provisioningColleges = colleges.filter((c) => c.status === "provisioning").length;
  const totalStudentsAcrossColleges = colleges.reduce((sum, c) => sum + c.totalStudents, 0);
  const totalAlumniAcrossColleges = colleges.reduce((sum, c) => sum + c.totalAlumni, 0);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredColleges = colleges.filter((college) => {
    const matchesSearch =
      !normalizedSearch ||
      college.name.toLowerCase().includes(normalizedSearch) ||
      college.slug.toLowerCase().includes(normalizedSearch);
    const matchesStatus = !statusFilter || college.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const tiles = [
    { label: "Total colleges onboarded", value: totalColleges, icon: Building2, tint: "bg-brand/10 text-brand" },
    { label: "Active colleges", value: activeColleges, icon: CheckCircle2, tint: "bg-success/10 text-success" },
    { label: "Colleges in provisioning", value: provisioningColleges, icon: Clock, tint: "bg-brand-accent/10 text-brand-accent" },
    { label: "Total students", value: totalStudentsAcrossColleges, icon: Users, tint: "bg-primary/10 text-primary" },
    { label: "Total alumni", value: totalAlumniAcrossColleges, icon: GraduationCap, tint: "bg-brand/10 text-brand" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Overview"
        description={
          <>
            Signed in as <span className="font-medium text-foreground">{session?.email}</span>
            {session?.role && (
              <span className="ml-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium">{session.role}</span>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map(({ label, value, icon: Icon, tint }) => (
          <Card key={label}>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardDescription className="text-xs font-medium uppercase tracking-wide">{label}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
              </div>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Colleges</CardTitle>
          <CardDescription>
            Showing {filteredColleges.length} of {totalColleges}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or college ID"
              />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="provisioning">Provisioning</option>
              <option value="suspended">Suspended</option>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">College</th>
                  <th className="pb-3 pr-4 font-medium">College ID</th>
                  <th className="pb-3 pr-4 font-medium">Status</th>
                  <th className="pb-3 pr-4 font-medium">Location</th>
                  <th className="whitespace-nowrap pb-3 pr-4 text-right font-medium">Total students</th>
                  <th className="whitespace-nowrap pb-3 text-right font-medium">Active students</th>
                </tr>
              </thead>
              <tbody>
                {filteredColleges.map((college) => (
                  <tr key={college.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 pr-4 font-medium">{college.name}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{college.slug}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={college.status} />
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {college.city ?? "—"}
                      {college.state ? `, ${college.state}` : ""}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{college.totalStudents}</td>
                    <td className="py-3 text-right tabular-nums">{college.activeStudents}</td>
                  </tr>
                ))}
                {filteredColleges.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No colleges match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
