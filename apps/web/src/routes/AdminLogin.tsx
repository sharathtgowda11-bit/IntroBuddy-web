import { useEffect } from "react";
import { RoleLoginPage } from "../components/RoleLoginPage.js";
import { getLoginPortal } from "../lib/loginPortals.js";

/**
 * The private Super Admin login -- deliberately not linked from /login or
 * anywhere else in the UI. Reuses RoleLoginPage's "admin" variant (email +
 * password only, POST /auth/admin-login) and the same super_admin branding
 * config every other portal page pulls from loginPortals.ts.
 */
export function AdminLogin() {
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    const previous = meta.content;
    meta.content = "noindex, nofollow";
    return () => {
      meta!.content = previous;
    };
  }, []);

  return <RoleLoginPage portal={getLoginPortal("super_admin")} variant="admin" />;
}
