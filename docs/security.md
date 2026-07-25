# Security Documentation

> The security model behind IntroBuddy, traced to code. The single
> non-negotiable property: **a bug in application code must not be able to
> return one college's data to another.** Everything below serves that, plus
> the standard auth/authz/abuse concerns.

## 1. Multi-tenancy

Model: **one shared database, `tenant_id` on every tenant-scoped table,
Postgres Row-Level Security** (ADR 0001). Isolation is enforced by the
database, not by developers remembering to filter.

Three implementation facts make it hold under pressure:

1. **The app connects as a non-owner role (`app_user`), never the table owner,
   never the Supabase `service_role` key.** Owners/superusers bypass RLS even
   with `FORCE`; the service-role key bypasses RLS entirely by design. Using
   either would make every other layer decorative. The service-role client
   exists in `apps/api` but is used **only** for GoTrue and Storage, never to
   query `public` tables (`lib/supabaseAuth.ts`).
2. **Tenant context is set per-transaction, never per-session.**
   `packages/db/withTenant()` runs `BEGIN; SELECT set_config('app.tenant_id',
   $1, true); …; COMMIT`. The `true` (SET LOCAL semantics) scopes it to the
   transaction so it can't leak onto a pooled connection reused by the next,
   unrelated request. `tenantId` always comes from the resolved session, never
   from client input.
3. **The policy uses `nullif(current_setting('app.tenant_id', true), '')`.**
   Postgres resets a custom GUC to an *empty string* (not NULL) after the
   setting transaction commits; casting `''::uuid` throws. `nullif` turns
   "no tenant set" into a clean "zero rows / fail closed" instead of a hard
   error.

```sql
create policy tenant_isolation on public.<table>
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

A forgotten `WHERE tenant_id = …` therefore returns **zero rows**, never
another tenant's data. A CI isolation test (`packages/db`) creates two tenants
and asserts one can never read the other's rows; per spec 6.6 it must never be
skipped or deleted.

`super_admin` is not an exception to this — it's anchored to a real sentinel
`platform` tenant (ADR 0007), so the same session/RLS machinery works for it
unchanged. Cross-tenant power is expressed as *permissions*
(`college.viewAll`, `college.create`), and `hasPermission` never consults
`tenant_id`.

## 2. Row-Level Security (RLS)

- Every tenant-scoped table: `ENABLE` **and** `FORCE ROW LEVEL SECURITY` +
  the `tenant_isolation` policy above. `FORCE` is mandatory — without it the
  policy is silently inert for the table's owner.
- Two tables deliberately have **no** RLS: `tenants` (it *is* the tenant, and
  needs to be queryable before any tenant context exists — e.g. slug→id at
  login) and `rate_limit_hits` (operational bookkeeping, ADR 0004).
- `audit_log` has the standard policy but a **narrower grant** — `select,
  insert` only (no `update`/`delete`) — so history is immutable at the
  database level (ADR 0008). `consents` and `student_profiles` similarly omit
  grants they must never need (`consents`: insert-only; `student_profiles`:
  no delete).

## 3. SECURITY DEFINER functions

Three functions run as their (privileged) owner and thus bypass RLS. Each is a
**narrow, named, single-purpose** hole, granted `EXECUTE` to `app_user` —
never a broad bypass, never a bypass-RLS *role*. Full definitions in
[database.md](database.md#sql-functions).

| Function | Why it must cross the RLS boundary | Scope of the hole |
|---|---|---|
| `find_auth_user_id_by_email(email)` | `app_user` has no grants on the GoTrue `auth` schema (and shouldn't); needed to reuse one identity across colleges | Returns exactly one column (`auth.users.id`) for one email |
| `claim_next_job(types[])` | The worker's "next queued job" is cross-tenant by nature — no tenant is known before claiming | Claims one `jobs` row (`FOR UPDATE SKIP LOCKED`); every later write still uses `withTenant` |
| `get_student_counts_by_tenant()` | The platform dashboard aggregates student counts across all tenants | Returns grouped counts only; no row-level data |

The discipline: reach for a `SECURITY DEFINER` function only when a query is
*inherently* cross-tenant/cross-schema, and keep each one minimal.

## 4. Password hashing & identity

- **We never store or hash passwords ourselves.** GoTrue (Supabase Auth) is
  the password/identity backend. `setPassword` uses the service-role Admin API
  (`updateUserById`); `verifyPassword` uses the anon client
  (`signInWithPassword`) and only reads the boolean result
  (`lib/supabaseAuth.ts`).
- Identities live in `auth.users`; `college_users.user_id` references them.
  The same person may have one `auth.users` row and multiple `college_users`
  rows across tenants (spec 6.5).
- Activation and reset **never** return a token in an API response (spec
  14.1) — the raw token only ever exists in the emailed link.

## 5. Breached-password check (HaveIBeenPwned)

`lib/breachedPassword.ts`, run on `POST /auth/activate` and
`POST /auth/reset/complete` (ADR 0006):

- Uses the **k-anonymity range API**: only the first 5 hex chars of the
  password's SHA-1 are sent; the full password/hash never leave the server; no
  API key.
- **Fails open**: any network error or the 3s timeout is treated as "not
  breached" so a third-party outage can't lock users out of activation/reset.
- Toggled by `BREACHED_PASSWORD_CHECK_ENABLED` (default `true`; `false` in CI
  to avoid a real network dependency — the fail-open design means this only
  affects test speed, not what's verified).

This is a deliberate contrast with the audit log (§8), which fails *closed*.

## 6. Rate limiting

`middleware/rateLimit.ts` + `db/rateLimits.ts` (ADR 0004):

- A plain Postgres table `rate_limit_hits (bucket, window_start, hit_count)`,
  incremented with a single upsert per request. Correct across multiple API
  replicas (unlike an in-process counter); no Redis.
- Applied to `login`, `activate`, `reset/request`, `reset/complete` — each
  bucketed per-IP (`"<route>:<ip>"`) at **10 requests / 15 minutes**
  (`AUTH_RATE_LIMIT`, `auth.ts`). Over the limit → `429 too many requests`.
- Fixed-window (not sliding/token-bucket) — sufficient for the abuse pattern
  (repeated login/reset/activation attempts).

## 7. Session management

First-party sessions (ADR 0002), not GoTrue JWTs:

- **Token shape:** `"<tenantId>.<rawToken>"`. The tenant prefix is an
  *untrusted routing hint* — it selects the RLS partition to query and grants
  nothing. Only `sha256(rawToken)`, matched in `public.sessions`, proves
  identity, **and** the stored row's real `tenant_id` must equal the prefix
  (`resolveSession.ts`). A tampered/mismatched prefix yields "not found," never
  cross-tenant access (covered by an isolation test and a tampered-token e2e
  test).
- **Storage:** only the SHA-256 hash is stored; raw tokens are never
  persisted. The browser keeps the opaque token in `localStorage` (remember-me
  on) or `sessionStorage` (off).
- **Expiry & revocation:** 24h expiry (`SESSION_EXPIRY_HOURS`). Completing a
  password reset and deactivating a student both **revoke all** of that user's
  sessions (`revokeAllSessionsForCollegeUser`). `resolveSession` rejects
  revoked/expired sessions and bumps `last_used_at` on each valid request.
- **Tenant is never read from a header, URL, or body** (spec 14.1 #1) — only
  from the token prefix, confirmed by the session lookup.

## 8. Audit logging

`db/auditLog.ts` (ADR 0008):

- `writeAuditLog()` is always called **inside the same `withTenant`
  transaction** as the action it records — e.g. in `POST /colleges` the tenant
  insert, taxonomy seed, admin invitation, and audit row commit together or
  not at all. There is no fire-and-forget logging path.
- **Fails closed:** if the audit insert fails, the whole action rolls back
  (unlike the breach check, §5, which fails open) — "we don't know who created
  this college" is not an acceptable outcome.
- Immutable by grant: `select, insert` only.
- `actor_college_user_id` uses `ON DELETE SET NULL` (history survives the
  actor's account removal) and may reference a *different* tenant (a
  super_admin acting on a new college). `action`/`target_type` are plain text,
  not enums, so new call sites don't each need a migration.
- Recorded actions today include `college.create`,
  `student.editManagedFields`, `student.deactivate` / `student.reactivate`,
  and `password.triggerReset`. Read via `GET /audit-log` (gated on
  `auditLog.view`).

## 9. Authorization & permission model

Data-driven, permission-based (ADR 0003), in `packages/shared/permissions.ts`.
The **frontend reuses the exact same `hasPermission`** for UX gating — it never
reimplements the rules.

- `PERMISSIONS`: named, dot-namespaced capabilities. `ROLE_PERMISSIONS`: the
  role→permissions matrix. Call sites use `requirePermission(PERMISSIONS.X)` /
  `hasPermission(role, X)`, never a role-string comparison.
- **Two-step gate on every protected route:** `resolveSession` (are you a
  valid session? → sets `req.session`) then `requirePermission` (does your role
  hold this permission? → 403 if not).
- "Set another user's password" is **deliberately absent** from the map — no
  role holds it and no route exists; a unit test asserts the constant doesn't
  exist so it can't be silently reintroduced.

### Permission matrix (current)

| Permission | super_admin | college_admin | student |
|---|:---:|:---:|:---:|
| `college.create` | ✅ | | |
| `college.suspend` | ✅ | | |
| `college.viewAll` | ✅ | | |
| `collegeAdmin.invite` | ✅ | ✅ | |
| `college.editProfile` | | ✅ | |
| `degree.manage` | | ✅ | |
| `student.import` | | ✅ | |
| `student.invite` | | ✅ | |
| `student.editManagedFields` | | ✅ | |
| `student.deactivate` | | ✅ | |
| `password.triggerReset` | | ✅ | ✅ |
| `profile.editOwn` | | ✅ | ✅ |
| `dashboard.view` | ✅ | ✅ | |
| `auditLog.view` | ✅ | ✅ | |

> `college.suspend` and `college.viewAll` are held by super_admin;
> `college.viewAll` backs the platform dashboard (`GET /colleges`).
> `college.editProfile`/`profile.editOwn` etc. reflect `ROLE_PERMISSIONS` in
> `permissions.ts` verbatim.

**Inviting whom:** `INVITE_TARGET_PERMISSION` maps a target role to the
permission required to invite it — `college_admin → collegeAdmin.invite`,
`student → student.invite`. So super_admin and college_admin can both invite a
college_admin; only college_admin can invite a student. Inviting a super_admin
is out of API scope entirely (ops/seed only).

## 10. Other hardening notes

- **Enumeration resistance:** login returns an identical `401` for unknown
  tenant / unknown user / wrong password / non-active status; reset-request
  returns an identical `200 "if an account exists…"` regardless of match, and
  silently sends an activation (not reset) email to never-activated users
  (`auth.ts`).
- **Image safety:** all uploaded images are EXIF-stripped and normalized with
  `sharp` before storage (no geotags/metadata persist); résumés are validated
  as real `application/pdf`. Buckets are private; URLs are signed per-read and
  never persisted.
- **Input validation:** every request body is validated with a zod schema from
  `@introbuddy/shared` before any DB work; SQL is always parameterized (incl.
  `set_config` via a bound parameter, not string interpolation).
- **Consent (DPDP):** captured atomically at student activation, versioned
  server-side (`CURRENT_POLICY_VERSION`), never accepted as client input,
  never overwritten.

## Related docs

- **[architecture.md](architecture.md)** — where these controls sit in the request path
- **[database.md](database.md)** — RLS policies, grants, and functions per table
- **[adr/](adr/README.md)** — the reasoning and alternatives behind each decision
