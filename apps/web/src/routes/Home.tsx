import { Navigate } from "react-router-dom";
import { useSession } from "../context/sessionContext.js";

/**
 * "/" is a role-based dispatcher: every role uses the persistent sidebar
 * (Sidebar.tsx) for navigation, so their home is simply their main page --
 * the platform dashboard for super_admin, the college dashboard for
 * college_admin, and the self-service profile for students.
 */
export function Home() {
  const { session } = useSession();

  if (session?.role === "super_admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }
  if (session?.role === "college_admin") {
    return <Navigate to="/college/dashboard" replace />;
  }
  return <Navigate to="/profile" replace />;
}
