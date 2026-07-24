import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { useSession } from "../context/sessionContext.js";
import { Button } from "./ui/button.js";

/** Redirects to /login when there's no valid session -- everything under this route is authenticated-only. */
export function ProtectedShell() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function TopNav() {
  const { session, logout } = useSession();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const orgName = session?.role === "super_admin" ? "IntroBuddy Platform" : (session?.tenantSlug ?? "IntroBuddy");

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-brand">IntroBuddy</span>
          <span className="text-sm text-muted-foreground">{orgName}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
