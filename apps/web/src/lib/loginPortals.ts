import type { Role } from "@introbuddy/shared";
import { Building2, GraduationCap, ShieldCheck, BookOpen, type LucideIcon } from "lucide-react";

export interface LoginPortalConfig {
  role: Role;
  path: string;
  /** Shown as the small wordmark on the login page itself, and in the role-mismatch error message. */
  portalLabel: string;
  heading: string;
  description: string;
  cardTitle: string;
  /** A short (2-3 word) tagline shown under the title on the /login portal-picker cards. */
  cardDescription: string;
  icon: LucideIcon;
  /** An existing design-system color token pairing (e.g. "bg-brand/10 text-brand") -- never a one-off color, so every portal stays visually consistent with the rest of the app. */
  chipClassName: string;
  valueProps: string[];
}

/**
 * Single source of truth for the four role-specific login experiences --
 * both the /login landing page's cards and each /login/:role page's
 * branding are built from this one list, so adding or renaming a portal
 * never requires touching more than this file plus a thin route wrapper.
 */
export const LOGIN_PORTALS: LoginPortalConfig[] = [
  {
    role: "super_admin",
    path: "/login/super-admin",
    portalLabel: "IntroBuddy Platform",
    heading: "Manage every college on one platform.",
    description: "Create colleges, invite administrators, and oversee onboarding across your entire network.",
    cardTitle: "Super Admin",
    cardDescription: "Global Management",
    icon: ShieldCheck,
    chipClassName: "bg-brand/10 text-brand",
    valueProps: [
      "Create and provision new colleges",
      "Invite and manage college administrators",
      "Oversee onboarding across every college",
    ],
  },
  {
    role: "college_admin",
    path: "/login/college-admin",
    portalLabel: "College Administration Portal",
    heading: "Run your college's onboarding, your way.",
    description: "Import students and alumni, manage your academic structure, and track activity at a glance.",
    cardTitle: "College Admin",
    cardDescription: "Campus Oversight",
    icon: Building2,
    chipClassName: "bg-brand-accent/10 text-brand-accent",
    valueProps: [
      "Bulk-import students and alumni",
      "Manage degrees, departments, and your college profile",
      "Track onboarding on your dashboard",
    ],
  },
  {
    role: "student",
    path: "/login/student",
    portalLabel: "Student Portal",
    heading: "Connect with alumni who've been where you are.",
    description: "Build your profile, browse verified alumni, and reach out for mentorship or referrals.",
    cardTitle: "Student",
    cardDescription: "Connect & Learn",
    icon: BookOpen,
    chipClassName: "bg-success/10 text-success",
    valueProps: [
      "Browse a verified alumni directory",
      "Send mentorship and referral requests",
      "Showcase your profile and certifications",
    ],
  },
  {
    role: "alumni",
    path: "/login/alumni",
    portalLabel: "Alumni Portal",
    heading: "Give back to the students who'll follow you.",
    description: "Share opportunities, respond to requests, and stay connected with your college.",
    cardTitle: "Alumni",
    cardDescription: "Mentor & Guide",
    icon: GraduationCap,
    chipClassName: "bg-primary/10 text-primary",
    valueProps: [
      "Post job, internship, and referral opportunities",
      "Respond to student mentorship requests",
      "Keep your professional profile up to date",
    ],
  },
];

export function getLoginPortal(role: Role): LoginPortalConfig {
  const portal = LOGIN_PORTALS.find((p) => p.role === role);
  if (!portal) throw new Error(`No login portal configured for role "${role}"`);
  return portal;
}

/**
 * The /login landing page's card grid -- deliberately excludes super_admin.
 * That portal is private (see /admin/login) and must never be advertised
 * alongside the customer-facing ones, even though its branding config still
 * lives in LOGIN_PORTALS above for AdminLogin.tsx to reuse.
 */
export const PUBLIC_LOGIN_PORTALS: LoginPortalConfig[] = LOGIN_PORTALS.filter((p) => p.role !== "super_admin");
