import {
  BadgeCheck,
  Briefcase,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  LineChart,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo.js";
import { Button } from "../components/ui/button.js";
import { PUBLIC_LOGIN_PORTALS } from "../lib/loginPortals.js";

/**
 * The public marketing homepage, shown at "/" to signed-out visitors only
 * (Home.tsx renders this when there's no session; an authenticated visitor
 * never sees it, and is dispatched to their dashboard as before). Every CTA
 * on this page points at /login -- the existing portal-picker -- rather
 * than duplicating a sign-in form here, and never links to the private
 * /admin/login from anywhere public.
 *
 * Deliberately omits: animated stat counters, a "trusted by" logo strip, and
 * testimonials -- imported from a richer design reference, but none of that
 * data is real yet (the dev database has two seeded colleges, not "12+"; the
 * reference's testimonial quotes are literally labelled "Placeholder Name").
 * This app's running rule (see LoginLanding.tsx/AlumniDirectory.tsx) is to
 * never fabricate data like that -- decided explicitly with the user rather
 * than assumed. The feature-keyword marquee below is kept: it's just a list
 * of real capabilities, not a claim about customers or scale.
 *
 * The mockup "frames" throughout are honest, simplified illustrations of
 * real screens (built from this app's own field names/labels), not actual
 * screenshots.
 */

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border-2 border-foreground/80 bg-card shadow-lg">
      <div className="flex items-center gap-1.5 border-b-2 border-border bg-muted/40 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 truncate text-xs text-muted-foreground">{title}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function FeatureRow({
  index,
  eyebrow,
  title,
  copy,
  bullets,
  reverse,
  frame,
}: {
  index: string;
  eyebrow: string;
  title: string;
  copy: string;
  bullets: string[];
  reverse?: boolean;
  frame: ReactNode;
}) {
  return (
    <div className="grid items-center gap-10 border-t py-14 sm:grid-cols-2 sm:gap-16">
      <div className={reverse ? "sm:order-2" : ""}>
        <p className="flex items-center gap-2 text-sm font-bold tracking-wide text-brand">
          <span className="h-2.5 w-2.5 bg-brand" />
          {index} — {eyebrow}
        </p>
        <h3 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{title}</h3>
        <p className="mt-4 max-w-md text-muted-foreground">{copy}</p>
        <ul className="mt-5 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="relative pl-5 text-sm text-foreground/90">
              <span className="absolute left-0 top-2 h-2 w-2 bg-brand" />
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "sm:order-1" : ""}>{frame}</div>
    </div>
  );
}

/** A small icon-badged card used by the core-features overview and the "why choose us" grid. */
function IconCard({ icon: Icon, title, copy, index }: { icon: typeof ShieldCheck; title: string; copy: string; index?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-foreground/80 bg-card p-6 shadow-md transition-transform hover:-translate-y-1 hover:-translate-x-1 hover:shadow-lg">
      {index ? (
        <p className="text-xs font-bold tracking-wide text-brand">{index}</p>
      ) : (
        <Icon className="h-7 w-7 text-brand" />
      )}
      <h4 className="font-bold tracking-tight">{title}</h4>
      <p className="text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}

const CORE_FEATURES: { icon: typeof ShieldCheck; title: string; copy: string }[] = [
  { icon: Users, title: "Alumni directory", copy: "Verified alumni profiles, searchable by company, role, and graduation year." },
  { icon: UserPlus, title: "Mentorship", copy: "Students request mentorship from alumni who've opted in to help." },
  { icon: Briefcase, title: "Referral requests", copy: "Students request referrals for posted opportunities and track each one." },
  { icon: ClipboardList, title: "Jobs & internships", copy: "Alumni post career and internship opportunities to your students." },
  { icon: LineChart, title: "College administration", copy: "Manage students, alumni, invitations, and onboarding from one console." },
  { icon: FileSpreadsheet, title: "Bulk invitations", copy: "Invite students and alumni with CSV or Excel imports and column mapping." },
  { icon: ShieldCheck, title: "Secure multi-tenant", copy: "Every college is isolated with row-level security — data never crosses." },
  { icon: BadgeCheck, title: "Audit log", copy: "Every administrative action is recorded and reviewable." },
];

const HOW_IT_WORKS: { step: string; title: string; copy: string }[] = [
  { step: "01", title: "The college joins", copy: "We provision an isolated tenant and your branded portal." },
  { step: "02", title: "Admin imports users", copy: "Bulk-import students and alumni from CSV or Excel, with validation." },
  { step: "03", title: "Users activate", copy: "Email activation lets everyone set a password and complete a profile." },
  { step: "04", title: "Connections happen", copy: "Students find alumni, request mentorship and referrals, and land opportunities." },
];

interface BenefitItem {
  title: string;
  copy: string;
}
const BENEFITS: { role: "admin" | "student" | "alumni"; label: string; sub: string; items: BenefitItem[] }[] = [
  {
    role: "admin",
    label: "College admin",
    sub: "The campus",
    items: [
      { title: "Manage students & alumni", copy: "One roster, always current, with statuses and departments." },
      { title: "Bulk imports", copy: "CSV/Excel with column mapping and per-row validation." },
      { title: "Onboarding", copy: "Email activation and one-off invitations — no manual accounts." },
      { title: "Audit log", copy: "Every administrative action recorded and reviewable." },
      { title: "Degrees & departments", copy: "Manage your academic structure from one place." },
      { title: "Secure tenant management", copy: "Row-level isolation so your data never leaves your college." },
    ],
  },
  {
    role: "student",
    label: "Students",
    sub: "The seeker",
    items: [
      { title: "Find alumni", copy: "Search and filter a verified directory by company and role." },
      { title: "Mentorship", copy: "Request guidance from alumni who opted in to help." },
      { title: "Referral requests", copy: "Ask for referrals with context and track every status." },
      { title: "Career opportunities", copy: "See jobs and internships alumni post to your college." },
      { title: "Networking", copy: "Build relationships that outlast a single request." },
      { title: "One place to track it", copy: "Pending, accepted, and replies — never lose a thread." },
    ],
  },
  {
    role: "alumni",
    label: "Alumni",
    sub: "The mentor",
    items: [
      { title: "Give back", copy: "Help students from your own college, on your schedule." },
      { title: "Mentor students", copy: "Accept, decline, or reply to mentorship requests." },
      { title: "Post jobs", copy: "Share openings and internships with the whole cohort." },
      { title: "Offer referrals", copy: "Respond to verified referral requests in one click." },
      { title: "Build connections", copy: "One verified profile, scoped to your college only." },
      { title: "No noise", copy: "Verified requests only — no spam, no strangers." },
    ],
  },
];

const WHY_US: { title: string; copy: string }[] = [
  { title: "Secure multi-tenant architecture", copy: "Each college is a fully isolated tenant from day one." },
  { title: "Verified alumni", copy: "Every alumnus is activated and scoped to their college." },
  { title: "Privacy-first design", copy: "Data isolation enforced at the database, not just the app." },
  { title: "Role-based access", copy: "Admin, student, and alumni each see only what they should." },
];

const MARQUEE_ITEMS = ["Mentorship", "Referrals", "Internships", "Networking", "Career opportunities", "Verified alumni"];

const FAQS: { q: string; a: string }[] = [
  {
    q: "How is student and alumni data kept separate between colleges?",
    a: "Every college is a fully isolated tenant. Isolation is enforced at the database with Postgres Row-Level Security, so a query can only ever return rows belonging to the signed-in college — not application logic that could be bypassed.",
  },
  {
    q: "How do students and alumni get their accounts?",
    a: "College admins bulk-import students and alumni from CSV or Excel, or send individual invites. Each person receives an email-based activation link and sets their own password — admins never handle credentials.",
  },
  {
    q: "What file formats does the bulk importer accept?",
    a: "CSV and Excel. During import you map your spreadsheet's columns to IntroBuddy's fields, and every row is validated before any account is created, so bad data is caught up front.",
  },
  {
    q: "How do students connect with alumni?",
    a: "Students search a directory of verified alumni, filter by company, role, or department, and send a mentorship or referral request. Alumni accept, decline, or reply from their dashboard, and students track each request's status.",
  },
  {
    q: "Can alumni opt out of mentorship requests?",
    a: "Yes — mentorship availability is a setting alumni control from their own profile. Referral requests tied to a posting they've shared always keep working regardless of that setting.",
  },
  {
    q: "How are alumni verified?",
    a: "Alumni are imported or invited by the college admin, then activate via a unique email link and confirm their details — so every profile in the directory is tied to a real, college-verified person.",
  },
  {
    q: "Can alumni post job opportunities?",
    a: "Yes. Verified alumni can post jobs, internships, and referral opportunities to the students of their college from their own dashboard.",
  },
  {
    q: "How do referral requests work?",
    a: "A student sends a structured referral request tied to an opportunity an alumnus posted; the alumnus accepts, declines, or replies; and the student follows it from pending to accepted — all inside the platform.",
  },
];

export function MarketingLanding() {
  const [activeBenefit, setActiveBenefit] = useState<"admin" | "student" | "alumni">("admin");
  const activePanel = BENEFITS.find((b) => b.role === activeBenefit)!;

  return (
    <div>
      <nav className="sticky top-0 z-20 flex items-center gap-7 border-b bg-background/90 px-6 py-4 backdrop-blur">
        <span className="mr-auto flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <Logo className="h-7 w-7" />
          IntroBuddy
        </span>
        <div className="hidden items-center gap-6 text-sm font-semibold lg:flex">
          <a href="#features" className="hover:text-brand">
            Features
          </a>
          <a href="#how" className="hover:text-brand">
            How it works
          </a>
          <a href="#showcase" className="hover:text-brand">
            Screenshots
          </a>
          <a href="#roles" className="hover:text-brand">
            For your campus
          </a>
          <a href="#faq" className="hover:text-brand">
            FAQ
          </a>
        </div>
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link to="/login">Sign in</Link>
        </Button>
      </nav>

      <div className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-12 py-16 sm:grid-cols-2 sm:gap-16 sm:py-24">
          <div>
            <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">
              Alumni network platform for colleges
            </span>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
              Connect students. Empower alumni. Strengthen your college community.
            </h1>
            <p className="mt-6 max-w-md text-muted-foreground">
              IntroBuddy helps colleges build secure alumni communities through mentorship, referrals, internships,
              networking, and career opportunities — one branded platform, isolated per college.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="brand" size="lg">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#features">Explore platform</a>
              </Button>
            </div>
          </div>
          <Frame title="College admin — Northgate University">
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              {[
                ["504", "Students"],
                ["212", "Verified alumni"],
                ["38", "Open referrals"],
              ].map(([n, l]) => (
                <div key={l} className="rounded border px-2 py-2.5">
                  <p className="text-lg font-bold text-brand">{n}</p>
                  <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <span className="flex-[2]">Name</span>
                <span className="flex-1">Department</span>
                <span className="flex-1">Status</span>
              </div>
              {[
                ["Maya Adeyemi", "Computer Science", true],
                ["Jonah Li", "Mechanical Eng.", false],
                ["Rhea Patel", "Economics", true],
              ].map(([name, dept, active]) => (
                <div key={name as string} className="flex items-center gap-2 border-b py-1.5 text-xs">
                  <span className="flex-[2] truncate">{name}</span>
                  <span className="flex-1 truncate text-muted-foreground">{dept}</span>
                  <span
                    className={`flex-1 rounded-full px-2 py-0.5 text-center text-[10px] font-medium ${
                      active ? "bg-success/15 text-success" : "bg-brand-accent/15 text-brand-accent"
                    }`}
                  >
                    {active ? "Active" : "Invited"}
                  </span>
                </div>
              ))}
            </div>
          </Frame>
        </section>
      </div>

      <div className="overflow-hidden border-y-2 border-foreground/80 bg-brand text-primary-foreground">
        <div className="flex w-max animate-marquee gap-8 py-3.5 hover:[animation-play-state:paused]">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="flex items-center gap-8 whitespace-nowrap text-lg font-extrabold uppercase tracking-tight">
              {item}
              <span className="h-2.5 w-2.5 rotate-45 bg-primary-foreground" />
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section className="border-t py-16 sm:py-20">
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">The problem &amp; the fix</span>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Before IntroBuddy vs. after.</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Most colleges sit on a powerful alumni network they can't actually use. IntroBuddy turns scattered
            contacts into a structured, active community.
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-lg border-2 border-foreground/80 bg-border sm:grid-cols-2">
            <div className="bg-card p-8">
              <p className="mb-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">Without IntroBuddy</p>
              <ul className="space-y-3.5 text-sm">
                {[
                  "Alumni data scattered across spreadsheets and inboxes",
                  "No structured mentorship — connections happen by luck",
                  "Weak alumni engagement and no way to measure it",
                  "Referrals require awkward cold outreach",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-muted text-xs font-bold text-muted-foreground">
                      ✕
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-brand/5 p-8">
              <p className="mb-5 text-xs font-bold uppercase tracking-widest text-brand">With IntroBuddy</p>
              <ul className="space-y-3.5 text-sm">
                {[
                  "One verified alumni directory, searchable and current",
                  "Structured mentorship requests and responses",
                  "Referral management from request to accepted",
                  "A centralized, isolated network the college owns",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center bg-brand text-xs font-bold text-primary-foreground">
                      ✓
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section id="features" className="border-t py-16 sm:py-20">
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">Core features</span>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Everything a college needs to run an alumni network.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CORE_FEATURES.map((f) => (
              <IconCard key={f.title} icon={f.icon} title={f.title} copy={f.copy} />
            ))}
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section className="border-t py-16 sm:py-20">
          <FeatureRow
            index="01"
            eyebrow="College admin"
            title="Bring your whole roster online in one import."
            copy="Upload students and alumni from CSV or Excel. IntroBuddy maps your columns, validates every row, and sends activation emails — no manual account creation."
            bullets={[
              "Column-mapping and per-row validation before anything is created",
              "Email-based account activation and one-off invites",
              "Manage degrees, departments, status, and password resets",
              "Full audit log of every administrative action",
            ]}
            frame={
              <Frame title="Manage students">
                <div className="space-y-2">
                  <div className="flex gap-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    <span className="flex-[2]">Name</span>
                    <span className="flex-1">Status</span>
                    <span className="flex-1">USN</span>
                  </div>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2 rounded border-b py-1.5 text-xs">
                      <span className="h-2 flex-[2] rounded bg-muted-foreground/25" />
                      <span className="h-4 flex-1 rounded-full bg-success/15" />
                      <span className="h-2 flex-1 rounded bg-muted-foreground/20" />
                    </div>
                  ))}
                </div>
              </Frame>
            }
          />

          <FeatureRow
            index="02"
            eyebrow="Alumni"
            title="Alumni post opportunities and reply on their terms."
            copy="Verified alumni get a focused dashboard: share jobs, internships, and referrals with your students, and accept or decline mentorship requests without leaving the platform."
            reverse
            bullets={[
              "Post jobs, internships, and referral opportunities",
              "Review, accept, decline, and message student requests",
              "Opt in or out of mentorship requests any time",
              "One verified profile, scoped to their college only",
            ]}
            frame={
              <Frame title="Alumni dashboard">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-full bg-brand-accent/20" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-24 rounded bg-muted-foreground/30" />
                    <div className="h-2 w-16 rounded bg-muted-foreground/20" />
                  </div>
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                    Available
                  </span>
                </div>
                <div className="mt-4 space-y-2 border-t pt-3">
                  <div className="h-6 rounded border bg-muted/40" />
                  <div className="h-6 rounded border bg-muted/40" />
                </div>
              </Frame>
            }
          />

          <FeatureRow
            index="03"
            eyebrow="Students"
            title="Students find the right alumnus and track every reply."
            copy="Search a directory of verified alumni by company, role, and department, send a mentorship or referral request, and follow it from pending to accepted — all in one place."
            bullets={[
              "Searchable, filterable alumni directory",
              "Send mentorship and referral requests with context",
              "Track status: pending, accepted, and replies",
            ]}
            frame={
              <Frame title="My requests">
                <div className="space-y-2">
                  {["Pending", "Accepted", "Pending"].map((status, i) => (
                    <div key={i} className="flex items-center justify-between rounded border bg-muted/30 px-3 py-2">
                      <div className="h-2 w-28 rounded bg-muted-foreground/25" />
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          status === "Accepted" ? "bg-success/15 text-success" : "bg-brand-accent/15 text-brand-accent"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </Frame>
            }
          />
        </section>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section id="how" className="border-t py-16 sm:py-20">
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">How it works</span>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            From roster to referrals in four steps.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((s) => (
              <div
                key={s.step}
                className="flex flex-col gap-2.5 rounded-lg border-2 border-foreground/80 bg-card p-6 shadow-md transition-transform hover:-translate-y-1 hover:-translate-x-1 hover:shadow-lg"
              >
                <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-brand">
                  <span className="h-2 w-2 bg-brand" />
                  Step {s.step}
                </p>
                <h4 className="font-bold tracking-tight">{s.title}</h4>
                <p className="text-sm text-muted-foreground">{s.copy}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section id="showcase" className="border-t py-16 sm:py-20">
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">Platform showcase</span>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">A closer look at the product.</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Every role gets a focused, uncluttered dashboard. Scroll through the core screens below.
          </p>
        </section>
        <div className="flex gap-5 overflow-x-auto pb-8" style={{ scrollSnapType: "x mandatory" }}>
          <div className="w-[320px] shrink-0 sm:w-[400px]" style={{ scrollSnapAlign: "start" }}>
            <Frame title="Sign in">
              <p className="text-base font-bold tracking-tight">Sign in to your college</p>
              <p className="mt-1 text-xs text-muted-foreground">Connect with the alumni who came before you.</p>
              <div className="mt-4 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Email</p>
                <div className="h-8 rounded border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground/70">you@college.edu</div>
              </div>
              <div className="mt-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Password</p>
                <div className="h-8 rounded border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground/70">••••••••••</div>
              </div>
              <div className="mt-4 rounded bg-brand py-2 text-center text-xs font-semibold text-primary-foreground">Sign in →</div>
            </Frame>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role-based sign-in</p>
          </div>
          <div className="w-[320px] shrink-0 sm:w-[400px]" style={{ scrollSnapAlign: "start" }}>
            <Frame title="Alumni directory">
              <div className="flex items-center gap-2 rounded border px-2.5 py-1.5 text-xs text-muted-foreground">
                Search alumni by company, role, or department
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {["Product", "Finance", "Engineering", "Design"].map((c, i) => (
                  <span
                    key={c}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      i === 0 ? "bg-foreground text-background" : "border text-muted-foreground"
                    }`}
                  >
                    {c}
                  </span>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {[
                  ["Sara Thomas", "Product Manager · Class of '15", "Request"],
                  ["Amara Okafor", "Data Analyst · Class of '17", "Accepted"],
                  ["Kevin Nakamura", "SW Engineer · Class of '13", "Pending"],
                ].map(([name, role, status]) => (
                  <div key={name} className="flex items-start gap-2.5 rounded border p-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                      {(name as string)
                        .split(" ")
                        .map((w) => w[0])
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold">{name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{role}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                        status === "Accepted"
                          ? "bg-success/15 text-success"
                          : status === "Pending"
                            ? "border text-muted-foreground"
                            : "bg-foreground text-background"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </Frame>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alumni directory &amp; requests</p>
          </div>
          <div className="w-[320px] shrink-0 sm:w-[400px]" style={{ scrollSnapAlign: "start" }}>
            <Frame title="Alumni dashboard">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ["3", "Open postings"],
                  ["5", "New requests"],
                  ["28", "Intros made"],
                ].map(([n, l]) => (
                  <div key={l} className="rounded border px-2 py-2">
                    <p className="text-base font-bold text-brand">{n}</p>
                    <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded border p-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">RP</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold">Rhea Patel</p>
                    <p className="text-[10px] text-muted-foreground">Economics · Referral request</p>
                  </div>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-medium text-muted-foreground">Pending</span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">"Would you be open to referring me for the analyst opening?"</p>
                <div className="mt-2.5 flex gap-1.5">
                  <span className="rounded bg-foreground px-2.5 py-1 text-[10px] font-semibold text-background">Accept</span>
                  <span className="rounded border px-2.5 py-1 text-[10px] font-semibold">Decline</span>
                </div>
              </div>
            </Frame>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alumni dashboard</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section id="roles" className="border-t py-16 sm:py-20">
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">Three roles, one campus</span>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">A portal built for everyone on campus.</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Every role signs in through its own portal and sees only what it should — enforced at the database with
            per-tenant row-level security.
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-lg border-2 border-foreground/80 bg-border sm:grid-cols-3">
            {PUBLIC_LOGIN_PORTALS.map((portal) => {
              const Icon = portal.icon;
              return (
                <div key={portal.role} className="bg-card p-6">
                  <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md ${portal.chipClassName}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold tracking-tight">{portal.cardTitle}</h4>
                  <p className="mt-1.5 text-sm text-muted-foreground">{portal.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section className="border-t py-16 sm:py-20">
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">Benefits by role</span>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Value for everyone on campus.</h2>
          <div className="mt-8 overflow-hidden rounded-lg border-2 border-foreground/80">
            <div className="flex border-b-2 border-foreground/80">
              {BENEFITS.map((b) => (
                <button
                  key={b.role}
                  type="button"
                  onClick={() => setActiveBenefit(b.role)}
                  className={`flex-1 border-r-2 border-foreground/20 px-5 py-4 text-left last:border-r-0 ${
                    activeBenefit === b.role ? "bg-foreground text-background" : "bg-background hover:bg-muted/50"
                  }`}
                >
                  <span className="block text-base font-bold tracking-tight">{b.label}</span>
                  <span className={`mt-1 block text-[11px] font-semibold uppercase tracking-wide ${activeBenefit === b.role ? "text-background/70" : "text-muted-foreground"}`}>
                    {b.sub}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid gap-x-8 gap-y-5 bg-card p-8 sm:grid-cols-3">
              {activePanel.items.map((item) => (
                <div key={item.title} className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 bg-brand" />
                  <div>
                    <b className="block text-sm font-bold tracking-tight">{item.title}</b>
                    <span className="text-sm text-muted-foreground">{item.copy}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section className="border-t py-16 sm:py-20">
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">Why choose IntroBuddy</span>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Built for colleges, not adapted for them.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_US.map((w, i) => (
              <IconCard key={w.title} icon={GraduationCap} index={String(i + 1).padStart(2, "0")} title={w.title} copy={w.copy} />
            ))}
          </div>
        </section>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <section id="faq" className="border-t py-16 sm:py-20">
          <span className="mb-4 block text-xs font-bold uppercase tracking-widest text-brand">Questions</span>
          <h2 className="max-w-lg text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Frequently asked.</h2>
          <div className="mt-8 max-w-3xl">
            {FAQS.map(({ q, a }, i) => (
              <details key={q} className="group border-b py-5" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center gap-4 font-bold tracking-tight [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-brand text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Ready to build stronger alumni connections?
          </h2>
          <p className="mt-5 max-w-lg text-white/80">
            Sign in to explore the student, alumni, and admin experience for yourself.
          </p>
          <div className="mt-8">
            <Button asChild variant="secondary" size="lg">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t py-14">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 sm:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Logo className="h-6 w-6" />
              IntroBuddy
            </span>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              The multi-tenant platform colleges use to onboard students and connect them with verified alumni.
            </p>
          </div>
          <div>
            <h5 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Platform</h5>
            <div className="space-y-2.5 text-sm">
              <a href="#features" className="block hover:text-brand">
                Features
              </a>
              <a href="#how" className="block hover:text-brand">
                How it works
              </a>
              <a href="#showcase" className="block hover:text-brand">
                Screenshots
              </a>
              <a href="#faq" className="block hover:text-brand">
                FAQ
              </a>
            </div>
          </div>
          <div>
            <h5 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Sign in</h5>
            <div className="space-y-2.5 text-sm">
              {PUBLIC_LOGIN_PORTALS.map((portal) => (
                <Link key={portal.role} to={portal.path} className="block hover:text-brand">
                  {portal.cardTitle}
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-6xl border-t px-6 pt-6 text-sm text-muted-foreground">
          IntroBuddy © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
