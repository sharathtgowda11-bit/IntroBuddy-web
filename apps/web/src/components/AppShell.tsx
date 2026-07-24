import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "../context/sessionContext.js";
import { Sidebar } from "./Sidebar.js";

/** Redirects to /login when there's no valid session -- everything under this route is authenticated-only. */
export function ProtectedShell() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
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
