import { RoleLoginPage } from "../components/RoleLoginPage.js";
import { getLoginPortal } from "../lib/loginPortals.js";

export function StudentLogin() {
  return <RoleLoginPage portal={getLoginPortal("student")} />;
}
