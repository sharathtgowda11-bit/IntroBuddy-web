# Architecture Decision Records

One file per significant, hard-to-reverse decision. Each full record is short: context, decision, consequences, alternatives considered. Status is `Accepted` unless noted otherwise. Don't edit a past ADR to reflect a later change of mind — write a new one and mark the old one Superseded, so the history of *why* stays intact.

| # | Decision | Status |
|---|---|---|
| [0001](0001-multi-tenant-isolation-shared-db-rls.md) | Multi-tenant isolation via shared database + Postgres RLS | Accepted |
| [0002](0002-first-party-session-tokens.md) | First-party compound session tokens instead of trusting Supabase Auth's JWT for tenant/role | Accepted |
| [0003](0003-permission-based-authorization.md) | Data-driven, permission-based authorization instead of role-string checks | Accepted |
| [0004](0004-postgres-backed-rate-limiting.md) | Rate limiting via a Postgres table instead of Redis | Accepted |
| [0005](0005-generic-smtp-deferred-provider.md) | Outbound email via generic SMTP, provider selection deferred | Accepted |
| [0006](0006-breached-password-check-fail-open.md) | Breached-password check via HaveIBeenPwned k-anonymity, fails open | Accepted |
| [0007](0007-platform-tenant-for-super-admin-sessions.md) | A sentinel platform tenant anchors super_admin sessions | Accepted |
| [0008](0008-audit-log-atomic-with-its-action.md) | The audit log is written atomically with the action it records | Accepted |

---

The summaries below capture, for each ADR: **what** was decided, **why**, the
**alternatives** weighed, and **why this** one won. Follow the link for the
full context and consequences.

## [0001](0001-multi-tenant-isolation-shared-db-rls.md) — Multi-tenant isolation via shared DB + Postgres RLS

- **Decision.** One shared Postgres database; every tenant-scoped table has
  `tenant_id` + a `FORCE ROW LEVEL SECURITY` policy keyed on a
  transaction-local `app.tenant_id`. The app connects as a non-owner role
  (`app_user`), sets tenant via `SET LOCAL` inside `withTenant()`, and the
  policy uses `nullif(current_setting(...), '')` to fail closed.
- **Why.** The one property that must never fail is cross-tenant data leakage;
  making isolation a database property means a forgotten `WHERE` returns zero
  rows, not another college's data.
- **Alternatives.** Database-per-tenant and schema-per-tenant — rejected:
  they multiply migration/pooling overhead per customer and make cross-tenant
  analytics hard, for an isolation benefit achievable more cheaply.
- **Why this.** At the target scale (5–15 colleges, ~75k students) RLS gives
  the same guarantee far more cheaply; a dedicated DB can still be carved out
  later for a single enterprise customer as an exception.

## [0002](0002-first-party-session-tokens.md) — First-party compound session tokens

- **Decision.** The API mints its own opaque session in `public.sessions`
  (hashed, expiring), and hands the browser a compound token
  `"<tenantId>.<rawToken>"`. GoTrue is used only as the password/identity
  backend. The same design covers activation and reset links.
- **Why.** Every tenant-scoped table (including `sessions`) is RLS-keyed on
  `app.tenant_id`, so *something* must resolve the tenant before any protected
  lookup — a chicken-and-egg the token prefix solves.
- **Alternatives.** Embedding `tenant_id`/`role` as GoTrue JWT custom claims —
  rejected: the claims hook fires on every refresh and can't know which of a
  user's several tenants a specific login was for without clobbering
  concurrent sessions on the shared `auth.users` row.
- **Why this.** A first-party session is tenant-aware, server-revocable
  (needed for reset/deactivate), and reuses one token design for sessions +
  invitations + resets. Cost: one table and one lookup per request — accepted.

## [0003](0003-permission-based-authorization.md) — Data-driven permission model

- **Decision.** Encode the whole spec 7.3 capability matrix once as data
  (`PERMISSIONS`, `ROLE_PERMISSIONS`); call sites use
  `hasPermission(role, PERMISSIONS.X)`, never a role-string comparison.
- **Why.** Roles will grow (a reduced "Placement Officer" is already
  foreseen); scattered `if (role === …)` checks turn every future change into
  a risky find-and-replace with no single view of the matrix.
- **Alternatives.** Inline role-string checks in handlers — rejected as
  unmaintainable and error-prone.
- **Why this.** Adding/altering a role becomes a one-file data edit; it caught
  a real spec mistake (college_admin *can* invite another college_admin) as a
  one-line fix, and the frontend reuses the exact same function for UX gating.

## [0004](0004-postgres-backed-rate-limiting.md) — Postgres-table rate limiting

- **Decision.** A plain `rate_limit_hits` table, incremented with one upsert
  per request; no RLS (operational bookkeeping).
- **Why.** Spec requires rate limiting on login/reset/activation; the
  architecture already rules out Redis at this scale.
- **Alternatives.** Redis (extra infra at a scale that doesn't need it) and an
  in-process `Map` (silently wrong the moment there's more than one API
  replica) — both rejected.
- **Why this.** Correct across replicas with zero new infrastructure; one
  extra write per request is acceptable at target volumes. Revisit only if
  the spec's own "sustained queue depth" trigger for Redis is hit.

## [0005](0005-generic-smtp-deferred-provider.md) — Generic SMTP, provider deferred

- **Decision.** Send via `nodemailer` over a generic SMTP transport,
  configured entirely by env vars; Mailpit locally.
- **Why.** The provider choice (Resend vs SES) is a cost/deliverability
  business decision the spec itself frames as revisitable and not needed to
  prove the invite/activate/login/reset flow.
- **Alternatives.** Committing to a provider SDK now — rejected: it couples
  real code to a decision that can wait.
- **Why this.** Nearly every provider offers SMTP, so switching later is an
  env change, not a code change; tests exercise real delivery against Mailpit.
  Deferred (not free): per-college sender identity, warm-up, bounce webhooks.

## [0006](0006-breached-password-check-fail-open.md) — HIBP k-anonymity, fail-open

- **Decision.** Check activation/reset passwords against HaveIBeenPwned's
  range API via k-anonymity (first 5 hash chars only); **fail open** on any
  error/timeout; toggle via env.
- **Why.** Spec requires a breached-password check; maintaining a local
  hundreds-of-millions-entry corpus is exactly the infra the project avoids
  building in anticipation.
- **Alternatives.** Local breach corpus (heavy infra) and fail-*closed*
  (a HIBP outage would lock users out of a correct activation) — both
  rejected.
- **Why this.** No new infra, no API key, password never leaves the server;
  availability of activation/reset is chosen over this one optional layer
  during a third-party outage — an explicit, documented trade-off. (Contrast
  ADR 0008, which fails closed because its failure mode is unacceptable.)

## [0007](0007-platform-tenant-for-super-admin-sessions.md) — Sentinel platform tenant

- **Decision.** A real `tenants` row (slug `platform`) anchors every
  super_admin's `college_users` row, created idempotently by code (not a
  migration). Super_admin login is an ordinary login; cross-tenant power is
  purely a permission check.
- **Why.** `college_users.tenant_id` is NOT NULL and every session is scoped
  by the token's tenant prefix, so a platform-wide role still needs *some*
  concrete tenant to anchor to.
- **Alternatives.** Making `tenant_id` nullable for super_admins — rejected:
  it would force an `or tenant_id is null` branch into every RLS policy, break
  the compound-token invariant, and reintroduce the chicken-and-egg the design
  avoids — high blast radius for no benefit.
- **Why this.** Zero changes to the shipped session/RLS machinery; and tracing
  the code shows `POST /colleges` needs **no** new service-role usage — tenant
  writes go through `app_user` (tenants has no RLS), and the only service-role
  call (GoTrue identity creation) already existed.

## [0008](0008-audit-log-atomic-with-its-action.md) — Audit log atomic with its action

- **Decision.** `writeAuditLog()` runs inside the same `withTenant`
  transaction as the action it records — they commit together or not at all.
  The table is granted `select, insert` only (immutable).
- **Why.** A missing/incomplete audit trail is a compliance and accountability
  gap; "we don't know who did this" has no acceptable fallback.
- **Alternatives.** Best-effort, fire-and-forget logging — rejected: it can
  leave an action recorded with no trail.
- **Why this.** Failing *closed* is correct here (deliberate contrast with the
  fail-open breach check): if the audit insert fails, the action itself rolls
  back. Immutability is enforced by Postgres grants, not just convention;
  `action`/`target_type` stay plain text so new call sites need no migration.
