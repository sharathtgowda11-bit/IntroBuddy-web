# IntroBuddy — Production Readiness Plan

> **Accuracy contract.** Recommendations here are grounded in what's actually
> built (see [architecture.md](architecture.md), [security.md](security.md))
> — not a generic "how to launch a SaaS" checklist. Prices are estimates as of
> this writing; verify current pricing before budgeting, since providers
> revise tiers regularly.

## 0. Where IntroBuddy already stands

Three infrastructure decisions are already made and deeply embedded in the
code — this plan builds on them rather than replacing them:

| Already built | Where | Verdict |
|---|---|---|
| Supabase (Postgres + GoTrue Auth + Storage) | `supabase/`, `apps/api/src/lib/supabaseAuth.ts` | **Keep.** RLS-based tenancy (`withTenant`, `packages/db`) and signed-URL storage patterns are written directly against Supabase's primitives. Migrating off it means rewriting the tenancy model itself. |
| First-party compound session tokens on top of GoTrue | ADR 0002 | **Keep.** GoTrue is used for identity/password only; sessions are the app's own table. No reason to adopt Auth0/Clerk wholesale — see §3 for the one thing worth adding (SSO). |
| Postgres-backed job queue (`claim_next_job`, `packages/jobs`) | ADR-worthy, `supabase/migrations/20260723161102_student_import.sql` | **Keep for now.** Simple, no extra infra (no Redis), fine to hundreds of thousands of jobs/day. See §12 for the upgrade path. |

Everything below is either genuinely new (hosting, DNS, monitoring, error
tracking, analytics) or a production-hardening upgrade of a dev-only stand-in
(email currently goes to Mailpit; rate limiting and secrets need an
edge/production posture).

---

## 1. Hosting & Compute

| | Recommendation | Why |
|---|---|---|
| **Frontend (`apps/web`)** | **Vercel** | Zero-config Vite deploys, global edge CDN included, automatic preview URLs per PR (invaluable for a team reviewing UI changes), auto SSL. The closest thing to a solved problem in this stack. |
| **API (`apps/api`)** | **Render** (Web Service) | Git-push deploys, native background workers, cheap always-on instances, built-in TLS, health checks, zero-downtime deploys. Simpler ops than Fly/AWS for a small team. |
| **Worker (`apps/worker`)** | **Render** (Background Worker) | Same platform as the API — one dashboard, one billing relationship, one deploy pipeline for both Node services. |

**MVP (cost-effective):** Vercel Hobby is free but its ToS is personal-use
only — for a company, **Vercel Pro** ($20/mo/seat) is the honest floor. Render:
two Starter instances (API + worker) at ~$7/mo each = **~$14/mo**.
**MVP total: ~$34/mo.**

**Long-term scale:** Move `apps/api`/`apps/worker` to **Fly.io** or **AWS ECS
Fargate**, deployed in the same region as the Supabase Postgres instance to
cut cross-region latency, with autoscaling and multi-instance redundancy.
Keep Vercel for the frontend regardless of scale — there's no reason to
self-host static asset delivery. Budget **$150–800/mo** depending on instance
count and traffic.

---

## 2. Database

**Recommendation: Supabase Cloud (Pro tier minimum for launch).**

The free tier pauses projects after a week of inactivity and has no
point-in-time recovery — not viable for real user data. **Pro ($25/mo)** is
the floor: no pausing, 7-day log retention, daily backups.

| Tier | Cost | When |
|---|---|---|
| Free | $0 | Dev/CI only — never production |
| **Pro** | **$25/mo** + usage | **MVP** — launch here |
| Pro + PITR add-on | +$100/mo | Once real student/alumni PII exists — point-in-time recovery is not optional at that point (see §13) |
| Team | $599/mo | SSO for your own staff, more compute, priority support |
| Enterprise / self-hosted Supabase (OSS) on your own Postgres (RDS/Aurora) | Custom | Only worth the migration effort at real scale — large compliance needs, or cost crossover where you're paying more in Supabase compute margin than the ops cost of running it yourself |

**MVP:** Pro, $25/mo. **Scale:** Pro + PITR, then Team as headcount/compute
needs grow. Self-hosting is a large lift — don't do it until Supabase's
managed pricing genuinely stops making sense.

---

## 3. Authentication

**Recommendation: keep Supabase Auth (GoTrue) — it's already paid for as
part of §2 and the app's session layer is built directly on top of it.**

Two additions worth planning for, not switching to a new provider for:

- **MFA (TOTP)** for `super_admin`/`college_admin` — Supabase Auth supports
  this natively today; enable it before onboarding real college staff.
- **Enterprise SSO (SAML)** — a plausible future ask once a college's IT
  department wants to log staff in via their own identity provider. Supabase
  Team tier includes SSO; if that's ever insufficient, **WorkOS** is the
  standard "bolt SSO/SCIM onto an existing app" service (~$0 for the first 1
  connection, then per-connection pricing) — add it as a layer in front of
  the existing session system, don't replace GoTrue.

**MVP:** $0 incremental (included in Supabase Pro). **Scale:** WorkOS if/when
a college demands SSO, ~$125/connection/mo.

---

## 4. Email — Transactional Provider & Templates

Today: `nodemailer` over generic SMTP (`apps/api/src/lib/email.ts`,
`packages/invitations/src/email.ts`), pointed at Mailpit in dev. Production
needs a real provider with deliverability reputation and a bounce/complaint
webhook.

| | Recommendation | Why |
|---|---|---|
| **Provider (MVP)** | **Resend** | Best developer experience, generous free tier, built specifically for transactional email, pairs natively with React Email. |
| **Provider (scale)** | **Amazon SES** | ~$0.10 per 1,000 emails — an order of magnitude cheaper than Resend/Postmark at real volume. Needs domain warm-up and more setup; not worth it until volume justifies the migration. |
| **Templates** | **React Email** (from the Resend team) | Replaces the current plain string-template emails with component-based, previewable, testable templates. Works with any SMTP/API provider, not just Resend. |

**MVP:** Resend free tier (3,000 emails/mo, 100/day) — **$0**, upgrading to
**Resend Pro ($20/mo for 50k/mo)** the moment volume crosses the free tier.
**Scale:** SES at ~$0.10/1,000 — a few dollars a month even at tens of
thousands of sends. Many companies front SES with Postmark/Resend for the
first year for deliverability, then migrate once reputation and volume both
justify it.

---

## 5. Object Storage

**Recommendation: keep Supabase Storage** — it's S3-compatible, already
integrated with the app's signed-URL pattern (`getSignedStudentMediaUrl`,
etc.) across `student-media`, `college-media`, `alumni-media`,
`college-imports`. No reason to introduce a second storage provider; it's
billed as part of the Supabase project (§2).

**If ever migrating off Supabase entirely:** Cloudflare R2 (no egress fees)
or AWS S3 + CloudFront are the natural landing spots — not a near-term
concern.

---

## 6. Domain, DNS, SSL/TLS

| | Recommendation | Why | Cost |
|---|---|---|---|
| **Domain registrar** | **Cloudflare Registrar** | At-cost pricing, no markup, no upsells | ~$10–15/year |
| **DNS** | **Cloudflare DNS** | Free, fast, and bundles CDN + WAF + rate limiting on the same free plan (see §7, §14, §15) | $0 |
| **SSL/TLS** | **Cloudflare Universal SSL** (Full Strict mode) + platform-issued certs (Vercel/Render auto-provision Let's Encrypt) | Automatic, free, no separate renewal process to manage | $0 |

**MVP and scale are identical here** — this is a solved problem regardless of
company size. Total: **~$1/mo amortized** (just the domain).

---

## 7. CDN

**Recommendation: Vercel's edge network for the frontend (included, no
extra config) + Cloudflare in front of the apex domain for everything else.**

One nuance worth being precise about: private media (avatars, logos, resumes)
is served via **signed, expiring URLs** from Supabase Storage — each URL is
unique and short-lived, so it isn't cacheable at a CDN layer the way static
assets are. CDN benefit here is real for the frontend JS/CSS bundle and any
genuinely public assets, not for the signed-URL media itself.

**MVP:** $0 (both included in Vercel + Cloudflare free tiers). **Scale:**
same — this doesn't need to change as the company grows.

---

## 8. Monitoring & Uptime

| | Recommendation | Why | Cost (MVP → Scale) |
|---|---|---|---|
| **Uptime/status page** | **Better Stack (Uptime)** | Clean status page, generous free tier, incident-friendly | $0 → $29/mo for more monitors + custom branding |
| **APM (performance)** | **Sentry Performance** (bundled with error tracking, §11) | Avoids running a second observability tool for a startup-sized team | included in Sentry pricing |
| **Full observability (scale-later)** | **Grafana Cloud** or **Datadog** | Metrics + logs + traces in one place, once infra topology (multiple services, autoscaling) makes single-dashboard visibility worth the cost | $0 small free tier → hundreds/mo |

**MVP:** Better Stack free + Sentry (already budgeted in §11) — **$0
incremental**. **Scale:** add Grafana Cloud or Datadog once there's more than
2–3 services to correlate.

---

## 9. Logging

**Recommendation: start with the hosting platform's built-in log viewer
(Render/Vercel), add Axiom once centralized search across services is
needed.**

Both `apps/api` and GoTrue already emit structured JSON logs (confirmed
during load testing — GoTrue's own error logs are structured JSON with
`level`, `msg`, `request_id`). Axiom is the best-fit next step: generous free
ingest tier, built for exactly this "centralize JSON logs from a few
services" use case, without the operational weight of self-hosted Loki/ELK.

**MVP:** Axiom free tier (0.5 GB/day ingest) — **$0**. **Scale:** Axiom paid
tiers or migrate to **Grafana Loki**/**Datadog Logs** if consolidating with
§8's observability stack.

---

## 10. Product Analytics

Two distinct jobs — don't conflate them:

| | Recommendation | Why | Cost |
|---|---|---|---|
| **In-app product analytics** (funnels: import → activation → profile completion → first request) | **PostHog** | Product analytics + session replay + feature flags + A/B testing in one tool; open-source-friendly, generous free tier | $0 up to 1M events/mo → usage-based |
| **Public marketing/landing site analytics** | **Plausible** | Privacy-first, no cookie banner required, lightweight — a different job than in-app funnels | ~$9/mo (or self-host free) |

**MVP:** PostHog free tier — **$0**. **Scale:** PostHog usage-based pricing
scales gracefully; add Plausible ($9/mo) whenever a marketing site exists.

---

## 11. Error Tracking

**Recommendation: Sentry, across all three apps (`web`, `api`, `worker`).**

This is close to a no-brainer regardless of company stage — industry
standard, covers frontend React errors, backend Node exceptions, and worker
job failures in one tool, with release tracking and source maps. Directly
relevant given this plan's load-testing finding (§13/production incident
scenario): Sentry would have surfaced the `verifyPassword` connection-pool
errors immediately, before code-level log-message auditing was needed.

**MVP:** Sentry free tier (5,000 errors/mo) — **$0**. **Scale:** Sentry Team,
**$26/mo**, scaling with event volume from there.

---

## 12. Background Jobs

**Recommendation: keep the existing Postgres-backed queue.** Don't introduce
Redis/BullMQ for the current job types (import commit, invitation sending) —
that trades a small amount of queue-feature convenience for an entirely new
piece of infrastructure to run, monitor, and back up, for no benefit at
current volume.

**Upgrade path, when actually needed:** **pg-boss** — a well-maintained
open-source Postgres job queue library that adds cron scheduling, delayed
jobs, and dead-letter queues while staying on Postgres (no new infra). Only
reach for a Redis-backed queue (BullMQ, Sidekiq-style) once job
throughput/latency genuinely requires sub-second dispatch at very high
volume — not a near-term concern.

**Cost:** $0 at every stage described above — it rides on the existing
Postgres instance.

---

## 13. Backups & Disaster Recovery

**Recommendation: two independent layers, not one.**

1. **Supabase Pro's daily automated backups**, upgraded to **point-in-time
   recovery (+$100/mo)** the moment real student/alumni PII exists. This is
   not optional for a product handling this category of data.
2. **A second, provider-independent backup**: a nightly `pg_dump` (or
   Supabase's own export) pushed to a separate cold-storage bucket
   (Cloudflare R2 — free egress, cheap storage). Relying solely on one
   vendor's own backup mechanism is a single point of failure if that
   vendor account/project itself has an incident.

**MVP:** Supabase Pro's included daily backups — **$0 incremental** (bundled
in §2's $25/mo), skip PITR until real user data exists. **Scale:** PITR
(+$100/mo) + R2 cold storage (a few dollars/mo for the object storage itself).

---

## 14. Security

Already strong at the application layer (RLS + `FORCE ROW LEVEL SECURITY` on
every tenant table, permission-based authorization — see
[security.md](security.md)). What's missing is edge-layer and
process-layer coverage:

| | Recommendation | Why | Cost |
|---|---|---|---|
| **Edge WAF** | **Cloudflare WAF** (free tier) | Basic managed rules, bot mitigation, DDoS protection in front of everything | $0 |
| **Dependency scanning** | **GitHub Dependabot** | Automated PRs for vulnerable dependencies | $0 |
| **Static analysis (SAST)** | **GitHub CodeQL** | Included with GitHub Advanced Security / free for the scanning workflow | $0–21/user/mo depending on repo visibility |
| **Secrets scanning** | **GitHub secret scanning** | Catches committed credentials before they ship | $0 |
| **Penetration test** | A reputable third-party firm | One-time, not a subscription — do this once there are paying customers and real PII in the system | ~$5,000–15,000 one-time |

**MVP:** all the free-tier items above — **$0/mo**. Budget the pen test as a
one-time line item before/at general availability, not a recurring cost.

---

## 15. Rate Limiting

**Recommendation: keep the existing app-level Postgres rate limiter
(`rate_limit_hits`, `apps/api/src/middleware/rateLimit.ts`) and add
Cloudflare's edge rate limiting rules (free tier) in front of it.**

This load-testing session confirmed the app-level limiter behaves correctly
under a 500-connection burst (see the load test summary in this
conversation) — no change needed there. Edge-level limiting is defense in
depth: it stops volumetric abuse before it even reaches the Node process,
cheaply, without replacing what already works.

**Cost:** $0 at MVP and scale (Cloudflare's free tier covers this).

---

## 16. Secrets Management

**MVP:** the hosting platforms' own encrypted env var storage (Render,
Vercel, and Supabase all support this natively) — sufficient for a small
team, no extra tool needed.

**Scale:** **Doppler** once the team grows past 2–3 engineers and keeping
`.env` files in sync across local dev, staging, and multiple hosting
platforms becomes genuinely painful. Doppler syncs one source of truth to all
of them.

**Cost:** $0 → **Doppler Team, ~$21/user/mo** once adopted.

---

## 17. CI/CD

**Recommendation: GitHub Actions.**

No real competitor at this stage — it's already the natural choice given the
codebase lives on GitHub, integrates with Vercel/Render's native deploy
hooks, and the free tier (2,000 minutes/mo on a private repo) comfortably
covers running the existing test suites (`packages/db`, `apps/api`,
`apps/worker`, `apps/web`) plus typecheck/lint on every PR.

**Recommended pipeline gate, in order:** typecheck → lint → unit/isolation
tests (`packages/db`, `packages/shared`, `packages/import`) → e2e tests
(`apps/api`, `apps/worker`) → frontend tests (`apps/web`) → build → deploy
(auto, on merge to `main`).

**Cost:** $0 → pay-per-minute only if the free tier is exceeded, which is
unlikely at this team size.

---

## 18. Environment & Configuration Management

Already strong: `apps/api/src/env.ts` fail-fasts on invalid config via a Zod
schema at boot — this pattern should be mirrored in `apps/worker` if it isn't
already.

**Non-negotiable before launch:** separate Supabase projects and separate
hosting environments for **dev**, **staging**, and **production** — never
point a staging deploy at the production Supabase project. A staging
environment that mirrors production topology is how you safely test
migrations and Phase 3+ changes against production-shaped data before real
users see them.

**Cost:** a second Supabase Pro project for staging, **+$25/mo** — the
cheapest insurance this plan recommends.

---

## 19. Compliance & Legal

The `consents` table (with `policy_version` tracking, per
[security.md](security.md)) already anticipates this well — it's a genuine
head start. Still needed before collecting real student/alumni data at
scale:

- A **lawyer-reviewed privacy policy and terms of service**, scoped to
  whichever regulatory regime applies to the target market (India's **DPDP
  Act** given the student/college context; **FERPA** considerations if
  serving US institutions; **GDPR** if any EU users). One-time legal cost,
  not a subscription — budget **$1,500–5,000** depending on jurisdiction
  complexity.
- Confirm the existing consent-capture flow (`POST /auth/activate`'s
  `consentAccepted` requirement) actually links to the *current* published
  policy version before general availability.

---

## 20. Support

Not needed pre-launch, but plan for it: a shared inbox or lightweight
helpdesk (**Help Scout**, ~$25/mo/user) once real college admins and students
start emailing with account/import issues.

---

## 21. Cost Summary

| Stage | Monthly total (estimate) | What's included |
|---|---|---|
| **MVP / launch** | **~$60–90/mo** | Supabase Pro ($25), Vercel Pro ($20), Render ×2 (~$14), domain amortized (~$1), Resend/PostHog/Sentry/Axiom/Better Stack/Cloudflare all on free tiers |
| **Early growth** | **~$300–600/mo** | + staging Supabase project (+$25), PITR (+$100), Resend Pro (+$20), Sentry Team (+$26), Better Stack paid (+$29), Plausible (+$9), larger Render instances |
| **Real scale** | **~$1,500–5,000+/mo** | Supabase Team ($599), larger/multi-region compute (Fly/AWS, $150–800), SES migration, Doppler (~$21/user), Grafana/Datadog observability, WorkOS if SSO is sold — highly workload-dependent |

---

## 22. Deployment Checklist — exact order

Configure in this order; each step assumes the ones above it are done.

1. **Domain** — register via Cloudflare Registrar; point nameservers at Cloudflare DNS.
2. **Supabase production project** — create it; note it is a *separate* project from dev/local, never the same one.
3. **Supabase staging project** — create a second project mirroring production, for testing migrations before they ship.
4. **Run all migrations** (`supabase/migrations/*.sql`) against both staging and production projects; verify RLS is `ENABLE`+`FORCE` on every tenant table (per §14/security.md).
5. **Secrets** — populate production env vars (`DATABASE_URL`, `SUPABASE_*`, SMTP/Resend keys, `WEB_APP_URL`) in Render/Vercel's encrypted env var stores; confirm `apps/api/src/env.ts`'s Zod validation passes on boot.
6. **Email provider** — verify the sending domain with Resend (SPF/DKIM/DMARC DNS records via Cloudflare), send a real test email before wiring any app code to it.
7. **Deploy API + worker to Render**, pointed at the production Supabase project; confirm `/health` responds and the worker successfully claims a test job.
8. **Deploy frontend to Vercel**, pointed at the production API URL; confirm the SPA loads and can reach `/auth/session`.
9. **DNS cutover** — point the apex/subdomain at Vercel (frontend) and the API subdomain at Render, through Cloudflare (proxied, orange-clouded) for CDN/WAF/rate limiting.
10. **SSL verification** — confirm Cloudflare is in Full (Strict) mode and both origins present valid certs; test the full HTTPS chain, not just the Cloudflare edge.
11. **CI/CD** — wire GitHub Actions to run the full test suite on every PR and auto-deploy `main` to production (Vercel/Render's native GitHub integration).
12. **Error tracking** — install Sentry SDKs in all three apps; trigger one deliberate test error per app to confirm events arrive.
13. **Uptime monitoring** — add Better Stack monitors for the frontend, the API `/health` endpoint, and (if exposed) a worker heartbeat.
14. **Logging** — wire Axiom (or confirm Render/Vercel's built-in log retention is sufficient for launch).
15. **Product analytics** — install PostHog in `apps/web`, confirm key funnel events fire (import → activation → profile complete).
16. **Backups** — confirm Supabase Pro's daily backup is active; if real PII exists at launch, enable PITR now, not after an incident.
17. **Rate limiting** — enable Cloudflare edge rate-limiting rules alongside the existing app-level limiter.
18. **Security scanning** — enable GitHub Dependabot and secret scanning on the repo.
19. **Legal** — publish the reviewed privacy policy/ToS; confirm the activation consent flow links to the live policy version.
20. **Smoke test in production** — run the full Siri & Rahul-style walkthrough (or Phase 1 equivalent) against the real production environment, not staging, before announcing launch.
21. **Go live** — announce, then watch Sentry/Better Stack/PostHog closely for the first 48 hours.
