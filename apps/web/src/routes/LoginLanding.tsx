import { Briefcase, ChevronRight, Globe, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../components/Logo.js";
import { Button } from "../components/ui/button.js";
import { PUBLIC_LOGIN_PORTALS } from "../lib/loginPortals.js";

const FEATURES = [
  {
    icon: Users,
    title: "Active Mentorship",
    description: "Real-world guidance from alumni who've walked your path before.",
  },
  {
    icon: Briefcase,
    title: "Career Pathways",
    description: "Job and internship opportunities shared directly by verified alumni.",
  },
  {
    icon: Globe,
    title: "One Network Per College",
    description: "Every connection stays within your own college's verified community.",
  },
];

/**
 * The /login landing page -- a portal picker plus static marketing content
 * introducing the product. Replaces the single shared login form.
 *
 * "About"/"Resources" nav links and a legal-links footer row were
 * deliberately left out: this app has no such pages to send anyone to, and
 * a dead link is worse than no link (same call made for the login page's
 * own redesign earlier). The hero's two CTAs, and the "Sign In" button,
 * all point at the portal picker below -- the only real action available
 * before choosing a role.
 */
export function LoginLanding() {
  return (
    <div>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Logo className="h-8 w-8" />
            <span className="text-lg font-semibold text-brand">IntroBuddy</span>
          </div>
        </div>
      </header>

      <section id="portals" className="border-b bg-muted/30 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold tracking-tight">Select Your Portal</h1>
          <p className="mt-1 text-muted-foreground">Access specialized tools for your specific role.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PUBLIC_LOGIN_PORTALS.map((portal) => {
              const Icon = portal.icon;
              return (
                <Link
                  key={portal.path}
                  to={portal.path}
                  aria-label={`Continue to ${portal.cardTitle}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${portal.chipClassName}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{portal.cardTitle}</p>
                      <p className="truncate text-xs text-muted-foreground">{portal.cardDescription}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-6 py-24 text-primary-foreground">
        <img src="/images/campus-hero.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand/95 via-brand/85 to-brand/60" />
        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wide">
            Connecting students &amp; alumni
          </span>
          <h2 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl">
            Empowering your academic journey beyond graduation.
          </h2>
          <p className="mt-5 max-w-xl text-white/80">
            IntroBuddy is the hub your college uses to onboard students and put them in touch with verified alumni --
            for mentorship, referrals, and everything that comes after graduation.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="secondary" size="lg">
              <a href="#portals">Explore Opportunities</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <a href="#portals">Browse the Alumni Network</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm text-muted-foreground">
          <Logo className="h-4 w-4" />
          IntroBuddy © {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
