# 2. First-party compound session tokens instead of trusting Supabase Auth's JWT for tenant/role

Status: Accepted (Milestone 2)

## Context

Supabase Auth (GoTrue) authenticates on email + password only; it has no concept of "tenant." Meanwhile every tenant-scoped table — including the new `invitations`, `password_resets`, and `sessions` tables this milestone adds — carries the FORCE RLS policy from ADR 0001, keyed on `app.tenant_id`. That creates a real chicken-and-egg problem: a query issued *before* the tenant is known returns zero rows by construction, so something has to resolve "which tenant is this request for" before any RLS-protected lookup can run at all.

The obvious-looking alternative — embed `tenant_id` and `role` as custom claims in GoTrue's own JWT via a `custom_access_token` hook — was considered and rejected. The hook fires on every token refresh, not just login, and the same person can hold a `college_users` row as `college_admin` at one college and `student` at another simultaneously (the schema explicitly allows this via `unique(tenant_id, user_id)`, per spec section 6.5, so a person can hold one login across colleges). A claims hook has no way to know which of a user's several tenants a *specific* login was for without stashing "current tenant" somewhere on the shared `auth.users` row — which would clobber concurrent sessions in different colleges for the same person.

## Decision

The API mints its **own** opaque session, in a first-party `public.sessions` table, following the same shape as invitation and password-reset tokens (hashed at rest, expiring, single-purpose — spec section 10.5). GoTrue is used purely as the password-hashing/identity backend underneath: our API calls it server-side to verify a password or provision an identity, but the token handed back to the browser is ours, not GoTrue's.

The token itself is a compound value: `"<tenantId>.<32-random-bytes-base64url>"` (`apps/api/src/lib/tokens.ts`). The tenant-id prefix is an **untrusted routing hint only** — it tells the server which RLS partition to query, nothing more. The random half is hashed (SHA-256) and checked against the `sessions` table; a request is only valid if that hash matches **and** the row's real `tenant_id` equals the prefix it was looked up under (`apps/api/src/middleware/resolveSession.ts`). A tampered or mismatched prefix produces "not found," never cross-tenant access — verified directly by an isolation test (`packages/db/src/authTables.isolation.test.ts`) and an end-to-end test using a deliberately tampered token (`apps/api/src/routes/auth.e2e.test.ts`).

The same compound-token design turned out to be necessary for **every** emailed link, not just sessions: activation links (`invitations`) and password-reset links (`password_resets`) hit the identical problem, since both tables carry the same FORCE RLS policy. All three token types share one encode/decode implementation.

## Consequences

- `sessions`, `invitations`, and `password_resets` all get the exact same FORCE RLS treatment as `college_users` (ADR 0001) — no table is a special case that needs its own reasoning about tenant safety.
- Login and password-reset requests need a `tenantSlug` field (added to `tenants`) to disambiguate, since USN is unique per-college and the same email can span colleges. Like the token prefix, this is a routing hint never trusted for authorization by itself.
- A session is revocable server-side (`revoked_at`) — e.g. spec section 8.6 requires completing a password reset to invalidate existing sessions, which a bare GoTrue JWT (valid until expiry, unrevokable without a separate blocklist) would not support as cleanly.
- Cost: one extra table and one extra round-trip per authenticated request (the session lookup) compared to trusting a self-contained JWT. Judged worth it for the tenant-safety guarantee and revocability.
