import { RoleLoginPage } from "../components/RoleLoginPage.js";
import { getLoginPortal } from "../lib/loginPortals.js";

export function AlumniLogin() {
  return <RoleLoginPage portal={getLoginPortal("alumni")} />;
}
