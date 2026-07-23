# 5. Outbound email via generic SMTP, provider selection deferred

Status: Accepted (Milestone 2)

## Context

The Phase 1 spec's own open-decisions table (section 17, #3) lists choosing an email provider (Resend vs. AWS SES) as "needed by Milestone 2," with Resend recommended for speed of integration and SES for cost at volume (spec section 10.2). Committing to a provider's specific SDK this early means real code depends on a business decision (cost vs. deliverability vs. setup time) that doesn't need to be made yet to prove the invite/activate/login/reset flow works, and that the spec itself frames as revisitable once real volume exists.

## Decision

Outbound email goes through `nodemailer` against a **generic SMTP transport** (`apps/api/src/lib/email.ts`), fully configured by environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Virtually every transactional provider — Resend, SendGrid, Postmark, SES — exposes an SMTP endpoint, so switching providers later is an environment-variable change, not a code change. In local development this points at Supabase's bundled Mailpit capture server; `supabase/config.toml`'s `local_smtp.smtp_port` was uncommented to expose it, since by default that block only lets Mailpit capture GoTrue's *own* mail, not the application's.

Confirmed with the user directly (rather than assumed) as part of Milestone 2 planning.

## Consequences

- The provider decision from spec section 10.2 remains genuinely open and low-cost to resolve later; nothing in `apps/api` needs to change to make it.
- End-to-end tests can and do exercise real email delivery against Mailpit's API (`apps/api/src/testHelpers/mailpit.ts`) rather than mocking the send call, since the token in an activation/reset link is deliberately never returned in an API response (spec section 14.1) — Mailpit is the only way to retrieve it in a test.
- Deferred, not free: per-college sender display-name customization, domain warm-up, and bounce/complaint webhook handling (spec sections 10.3-10.7) are provider-specific concerns not yet built and will need real design work whenever a provider is chosen for production.
- Email sending happens synchronously inline from `apps/api` this milestone, not queued through `apps/worker`, even though the README assigns "outbound email" there — queuing one email type isn't worth a second app's outbox infrastructure yet; that arrives with `apps/worker`'s first real responsibility (bulk import, Milestone 4), built once for all its jobs together. Marked with `// TODO(M4)` comments at the call sites.
