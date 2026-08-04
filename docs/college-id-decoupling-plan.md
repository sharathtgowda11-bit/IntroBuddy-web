# Decouple College Short Name from College ID (tenant slug)

> **Status: proposed, not yet implemented.** This document is the approved
> plan for a future change — no code has been modified yet. Implement by
> following the sections below when the work is scheduled.

## Context

Today "College Short Name" (typed once at creation) and "College ID" (the
tenant slug used for login/tenant resolution) are the *same value* — the
short name is `slugify()`'d and stored directly as `tenants.slug`, which is
`unique`. That means two real colleges that legitimately share a short name
(e.g. "BIET" in Karnataka vs. a different "BIET" in Maharashtra) can never
both onboard: the second creation is rejected with 409 purely because of a
display-name collision, not an actual identity collision. This plan splits
the two concepts: Short Name becomes a pure, non-unique display/branding
field; College ID becomes its own explicit, unique field used for login and
tenant resolution — decoupled but still auto-populated for convenience.

## What was found in the existing architecture

- **`shortName` is not actually stored today — it's thrown away after use.**
  `packages/shared/src/schemas/colleges.ts`'s `CollegeCreateSchema.shortName`
  only ever flows through `resolveRequestedSlug()`
  (`apps/api/src/routes/colleges.ts:36`), which does `slugify(shortName)` and
  checks `findTenantBySlug` for a collision. The `tenants` table
  (`supabase/migrations/20260723000001_tenancy_foundation.sql` +
  `..._auth_invitations.sql`'s `alter table tenants add column slug text not
  null unique`) has **no `short_name` column at all**. `CollegeProfile.tsx`'s
  "College Short Name" field is literally `profile.slug.toUpperCase()` — it
  isn't reading a stored short name, it's redisplaying the slug. This is why
  they collide: they're the same value by construction, not by coincidence.
- **The login/session/RLS stack never touches `shortName` at all** — it only
  ever consumes `slug`/`tenantId`. `POST /auth/login`'s `tenantSlug` field
  (`packages/shared/src/schemas/auth.ts`, `apps/api/src/routes/auth.ts:157`),
  `resolveSession()`, every `withTenant(pool, tenantId, ...)` call, and RLS
  itself are all keyed off `tenants.id`/`tenants.slug` and are completely
  unaffected by this change — this makes the change materially lower-risk
  than it might first sound: **zero auth/RLS/session code changes**, this is
  a tenants-table + colleges-route + two-pages change.
- **`slug` uniqueness is the actual isolation boundary already**, not
  `shortName` — `findTenantBySlug` (`apps/api/src/db/tenants.ts:59`) is what
  login resolves through, and the `unique` constraint on `tenants.slug` is
  what guarantees `withTenant(pool, tenantId, ...)` always lands on exactly
  one tenant. Splitting `shortName` out changes nothing about that guarantee
  — it just stops forcing `shortName` itself to satisfy it.
- **Exactly two surfaces read/write this today**: `CreateCollege.tsx` (create)
  and `CollegeProfile.tsx` (display-only today, via the same `slug` field).
  `sendCollegeAdminInvitationEmail` (`apps/api/src/lib/email.ts`) already
  states "your sign-in code is: `${tenantSlug}`" — correctly slug-based
  already, no change needed there.

## How to generate/manage the new College ID

| Approach | Pros | Cons |
|---|---|---|
| **Fully manual** (admin types College ID directly, separate from Short Name) | Simple mental model; full admin control | Extra required field with no help; admin must invent a valid unique value themselves; more typing for no benefit in the common case where the short name is already unique |
| **Fully auto-generated opaque ID** (random/sequential, e.g. `COL-00042`) | Zero collision risk; zero admin effort | Bad for the *actual* highest-frequency use of this value: every single login, by every student/alumni/admin, forever. An opaque string is exactly the wrong trade-off for a value people retype constantly. |
| **Recommended: auto-suggested, editable, validated** — client suggests `slugify(shortName)` the moment Short Name is typed, admin can freely edit the suggestion, server validates uniqueness at submit (same 409 pattern as today) | Zero extra typing in the common case (most short names *are* unique); the rare collision (two "BIET"s) is trivially resolved by editing the suggested ID (`biet` → `biet-ka` / `biet-mh`); matches the app's existing "combobox + editable override" UX precedent (`Combobox`'s `allowCustomEntry` on the City field, same file) | Slightly more UI state than a single field (an "edited by user" flag so further Short Name edits don't clobber a manual override) |

Recommendation: the third option. It's the same shape as a Slack/GitHub
workspace-slug picker — suggest, allow override, validate on save — and
requires no new backend concept beyond renaming which field feeds the
existing `resolveRequestedSlug`/409 flow.

## Implementation plan

### 1. Database — one additive migration
New `supabase/migrations/<ts>_college_short_name.sql`:
```sql
alter table public.tenants add column short_name text;
update public.tenants set short_name = upper(slug);
alter table public.tenants alter column short_name set not null;
```
`slug` itself is untouched (still `unique`, still the College ID). Existing
BIET/GMIT/platform get `short_name` backfilled from their current slug
(`BIET`, `GMIT`, `PLATFORM`) — visually identical to what they show today,
and their College ID (login value) does not change.

### 2. `packages/shared`
- `CollegeCreateSchema` (`schemas/colleges.ts`): keep `shortName` (now purely
  display, comment updated to say so) and add a new required `collegeId:
  z.string().trim().min(1)` — the field that actually becomes the slug.
- `CollegeProfileUpdateSchema`: add optional `shortName: z.string().trim().min(1)`
  so it becomes editable later, same optional-field pattern as
  `description`/`contactEmail` already there.

### 3. `apps/api`
- `db/tenants.ts`: add `shortName`/`short_name` to `TenantRecord`, `TenantRow`,
  `mapRow`, `SELECT_COLUMNS`, `CreateTenantParams` (required), and
  `UpdateTenantProfileParams` (optional, same `coalesce($n, short_name)`
  pattern already used for `description`/`contact_email` in
  `updateTenantProfile`).
- `routes/colleges.ts`: rename `resolveRequestedSlug(pool, shortName)` →
  `resolveRequestedSlug(pool, collegeId)` (identical body — `slugify` +
  `findTenantBySlug`); `POST /` destructures `collegeId` for slug resolution
  and passes `shortName` straight to `createTenant` as display data; 409
  message becomes `"this college ID is already in use"`. `PATCH
  /me/profile` passes `parsed.data.shortName` through to
  `updateTenantProfile` alongside the existing fields — no new permission
  gate needed, already gated on `COLLEGE_EDIT_PROFILE`.

### 4. `apps/web`
- `CreateCollege.tsx`: `emptyForm` gains `collegeId: ""`. Short Name field's
  helper text changes to "A display name for this college — duplicates are
  fine." New "College ID" field directly below it: value auto-set to
  `slugify(shortName)` (reuse `@introbuddy/shared`'s `slugify`) on every
  Short Name change **until the user edits College ID directly** (a
  `collegeIdTouched` boolean flips on that field's own `onChange`), styled
  `font-mono` like the current read-only slug displays elsewhere; helper
  text: "Used to sign in. Must be unique across every college." Submit body
  gains `collegeId`.
- `CollegeProfile.tsx`: `CollegeProfile` interface gains `shortName: string`
  (already present in `GET /colleges/me`'s response once `mapRow` includes
  it — no route change needed to read it). "College Short Name" field
  becomes a real controlled `Input` (state + `applyProfile`/`handleDiscard`
  wiring exactly like `description`/`contactEmail`, appended to the
  `FormData` in `handleSubmit`). Add a new, separate **read-only** "College
  ID" field showing `profile.slug`, copy: "Used to sign in — can't be
  changed here" (deliberately keeping the login identifier immutable
  post-creation; changing an existing college's slug is out of scope for
  this change and a materially bigger risk).

### 5. Tests
- `apps/api/src/routes/colleges.e2e.test.ts`: add `collegeId` to every
  existing `POST /colleges` body; update the slug-equality assertion to
  compare against `slugify(collegeId)`; rename the "short name in use" test
  to be about `collegeId` collision; **add the one test that proves the fix**
  — two colleges with the *same* `shortName` but different `collegeId` both
  succeed (201/201).
- `apps/web/src/routes/CreateCollege.test.tsx`: fill "College ID" in the
  shared `fillForm` helper; update `apiPost` assertions to include
  `collegeId`; add a test for the auto-suggest-until-edited behavior; add a
  test that two submissions with the same Short Name but different College
  ID both post successfully.
- `apps/web/src/routes/CollegeProfile.test.tsx`: assert Short Name is now
  editable and included in the submitted `FormData`; assert a read-only
  College ID field renders `profile.slug`.

### 6. Docs
`docs/database.md`: add `short_name text NOT NULL` to the `tenants` column
list, ER diagram, and example row.

## Backward compatibility & rollback

- **Zero disruption to existing colleges.** BIET/GMIT keep their exact
  current slugs; no re-authentication, no re-training, no data migration for
  any existing student/alumni/admin login.
- **Zero change to auth, sessions, or RLS** — confirmed above, this touches
  only `tenants`, `routes/colleges.ts`, and two frontend pages.
- **Rollback is a straight revert**: since the migration is purely additive
  (new nullable→backfilled→NOT NULL column, no constraint changes to `slug`),
  rolling back means a follow-up migration dropping `short_name` plus
  reverting the application code to today's shortName→slug derivation. No
  data loss is possible for the load-bearing `slug` column at any point in
  this change.

## Verification (once implemented)

- `npx tsc -b` + `npm run lint` clean.
- `npm --workspace apps/api test` (colleges.e2e.test.ts, full suite for
  regression safety) green.
- `npx vitest run` targeted at `CreateCollege.test.tsx` and
  `CollegeProfile.test.tsx` green.
- Manual walkthrough: create two colleges both named "BIET" with distinct
  College IDs (e.g. `biet-ka`, `biet-mh`) — both succeed; log into each with
  its own College ID; existing BIET/GMIT logins still work unchanged; a
  college_admin edits their Short Name on `/college/profile` and it saves
  without altering their College ID or requiring re-login.
