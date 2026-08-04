import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../context/sessionContext.js";
import { Sidebar } from "./Sidebar.js";

/**
 * Redirects to /login when there's no valid session -- everything under
 * this route is authenticated-only. An expired/missing session under
 * /admin/* redirects to the private /admin/login instead of the public
 * picker -- there's no session left to read the role from at that point, so
 * the path itself (super_admin's routes all live under /admin, e.g.
 * /admin/dashboard, /admin/colleges/new) is the only signal available.
 */
export function ProtectedShell() {
  const { session, isLoading } = useSession();
  const location = useLocation();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    return <Navigate to={location.pathname.startsWith("/admin") ? "/admin/login" : "/login"} replace />;
  }

  // Every authenticated role uses the persistent sidebar shell (Sidebar.tsx
  // adapts its items/subtitle per role). h-screen + overflow-hidden caps the
  // shell at viewport height so only <main> scrolls -- the sidebar stays put.
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
