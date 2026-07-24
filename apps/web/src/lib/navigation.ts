import type { Permission, Role } from "@introbuddy/shared";
import { PERMISSIONS } from "@introbuddy/shared";
import {
  BookOpen,
  Building2,
  History,
  LayoutDashboard,
  MailCheck,
  Settings2,
  UploadCloud,
  UserCircle,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavAction {
  section: string;
  icon: LucideIcon;
  title: string;
  description: string;
  to: string;
  visible: (can: (permission: Permission) => boolean, role: Role | undefined) => boolean;
}

/** Single source of truth for every permission-gated destination in the app -- used by both Home's card grid and the super_admin sidebar. */
export const NAV_ACTIONS: NavAction[] = [
  {
    section: "Colleges",
    icon: Building2,
    title: "Create a college",
    description: "Onboard a new college onto the platform.",
    to: "/admin/colleges/new",
    visible: (can) => can(PERMISSIONS.COLLEGE_CREATE),
  },
  {
    section: "Colleges",
    icon: MailCheck,
    title: "Resend admin activation",
    description: "Re-send an activation link to a college admin.",
    to: "/admin/colleges/reinvite",
    visible: (can) => can(PERMISSIONS.COLLEGE_CREATE),
  },
  {
    section: "College setup",
    icon: Settings2,
    title: "Edit college profile",
    description: "Logo, banner, description, and contact details.",
    to: "/college/profile",
    visible: (can) => can(PERMISSIONS.COLLEGE_EDIT_PROFILE),
  },
  {
    section: "College setup",
    icon: BookOpen,
    title: "Manage degrees & departments",
    description: "Your college's academic structure.",
    to: "/college/degrees",
    visible: (can) => can(PERMISSIONS.DEGREE_MANAGE),
  },
  {
    section: "Students",
    icon: UploadCloud,
    title: "Import students",
    description: "Bulk-onboard students from a CSV or Excel file.",
    to: "/college/import",
    visible: (can) => can(PERMISSIONS.STUDENT_IMPORT),
  },
  {
    section: "Students",
    icon: UserPlus,
    title: "Invite a student",
    description: "Add a single student and send an activation email.",
    to: "/college/invite-student",
    visible: (can) => can(PERMISSIONS.STUDENT_INVITE),
  },
  {
    section: "Students",
    icon: Users,
    title: "Manage students",
    description: "Search, edit, deactivate, or reset a password.",
    to: "/college/students",
    visible: (can) => can(PERMISSIONS.STUDENT_EDIT_MANAGED_FIELDS),
  },
  {
    section: "Insights",
    icon: LayoutDashboard,
    title: "Dashboard",
    description: "Onboarding and activity across every college.",
    to: "/admin/dashboard",
    visible: (can, role) => role === "super_admin" && can(PERMISSIONS.COLLEGE_VIEW_ALL),
  },
  {
    section: "Insights",
    icon: LayoutDashboard,
    title: "Dashboard",
    description: "Your college's student activity at a glance.",
    to: "/college/dashboard",
    visible: (can, role) => role === "college_admin" && can(PERMISSIONS.DASHBOARD_VIEW),
  },
  {
    section: "Insights",
    icon: History,
    title: "Audit log",
    description: "A record of administrative actions.",
    to: "/college/audit-log",
    visible: (can) => can(PERMISSIONS.AUDIT_LOG_VIEW),
  },
  {
    section: "My account",
    icon: UserCircle,
    title: "My profile",
    description: "Photo, resume, certifications, and links.",
    to: "/profile",
    // The backend grants college_admin PROFILE_EDIT_OWN too (spec 7.3), but
    // this is the student self-service profile (USN, batch, certifications),
    // which is meaningless for an admin -- so only surface it to students.
    visible: (can, role) => role === "student" && can(PERMISSIONS.PROFILE_EDIT_OWN),
  },
];

/** "smoke-test-super" -> "ST"; a real name like "Jane Doe" -> "JD". */
export function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
  }
  const localPart = email.split("@")[0] ?? "";
  const segments = localPart.split(/[.\-_]/);
  return ((segments[0]?.[0] ?? "") + (segments[1]?.[0] ?? "")).toUpperCase();
}
