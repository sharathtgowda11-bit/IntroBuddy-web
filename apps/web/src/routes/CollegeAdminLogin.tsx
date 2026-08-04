import { RoleLoginPage } from "../components/RoleLoginPage.js";
import { getLoginPortal } from "../lib/loginPortals.js";

export function CollegeAdminLogin() {
  return <RoleLoginPage portal={getLoginPortal("college_admin")} />;
}
