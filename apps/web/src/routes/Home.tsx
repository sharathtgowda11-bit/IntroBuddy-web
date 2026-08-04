import { Navigate } from "react-router-dom";
import { useSession } from "../context/sessionContext.js";
import { MarketingLanding } from "./MarketingLanding.js";

/**
 * "/" is public: a signed-out visitor sees the marketing homepage, and an
 * authenticated one is dispatched straight to their role's main page --
 * the platform dashboard for super_admin, the college dashboard for
 * college_admin, and the self-service profile for students. This route
 * lives outside ProtectedShell (see App.tsx) specifically so the
 * signed-out case has somewhere to render instead of being redirected to
 * /login before ever reaching this component.
 */
export function Home() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!session) {
    return <MarketingLanding />;
  }
  if (session.role === "super_admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (session.role === "college_admin") {
    return <Navigate to="/college/dashboard" replace />;
  }
  if (session.role === "alumni") {
    return <Navigate to="/alumni/dashboard" replace />;
  }
  return <Navigate to="/profile" replace />;
}
