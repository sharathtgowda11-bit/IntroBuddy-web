import { LogOut } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../context/sessionContext.js";
import { getInitials, NAV_ACTIONS } from "../lib/navigation.js";
import { Logo } from "./Logo.js";

/**
 * Sidebar-specific display order by route -- deliberately different from
 * NAV_ACTIONS' declaration order, which drives Home's card grid. Covers
 * both roles that use the sidebar (super_admin and college_admin); each
 * only ever sees its own visible subset in this order. Routes not listed
 * fall to the end, preserving their NAV_ACTIONS order.
 */
const SIDEBAR_ORDER = [
  // super_admin
  "/admin/dashboard",
  "/admin/colleges/new",
  "/admin/colleges/reinvite",
  // college_admin
  "/college/dashboard",
  "/college/students",
  "/college/import",
  "/college/invite-student",
  "/college/degrees",
  "/college/profile",
  // shared
  "/college/audit-log",
  "/profile",
];

function sidebarRank(to: string): number {
  const index = SIDEBAR_ORDER.indexOf(to);
  return index === -1 ? SIDEBAR_ORDER.length : index;
}

/**
 * Persistent left-nav shell, used for super_admin and college_admin (the
 * student experience still uses AppShell's TopNav) -- see ProtectedShell.
 * Reuses NAV_ACTIONS, the same permission-gated action list Home's card
 * grid is built from, so there's one source of truth for "what can this
 * role reach."
 */
export function Sidebar() {
  const { session, can, logout } = useSession();
  const location = useLocation();
  const navigate = useNavigate();

  const items = NAV_ACTIONS.filter((action) => action.visible(can, session?.role)).sort(
    (a, b) => sidebarRank(a.to) - sidebarRank(b.to),
  );

  const subtitle = session?.role === "super_admin" ? "Platform" : (session?.tenantSlug ?? "College");

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2.5 border-b p-5">
        <Logo className="h-9 w-9 shrink-0" />
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">IntroBuddy</p>
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map(({ to, title, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {title}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 border-t p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {getInitials(session?.name ?? null, session?.email ?? "")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{session?.email.split("@")[0]}</p>
          <p className="text-xs text-muted-foreground">{session?.role}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
