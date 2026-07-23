# 7. A sentinel platform tenant anchors super_admin sessions

Status: Accepted (Milestone 3)

## Context

`super_admin` is described as platform-wide, cross-tenant (spec section 7.1) — not naturally tied to any one college. But `college_users.tenant_id` is `NOT NULL`, and every session lookup is scoped via `withTenant(pool, tenantId, ...)` using the compound token's tenant prefix (ADR 0002). A `super_admin` still needs *some* concrete tenant to anchor their own login, or the existing session-resolution mechanism has nowhere to point for them specifically.

There was also, before this milestone, no `super_admin` account anywhere in the system at all — nothing seeds one, and this milestone is exactly the one that needs one to exist, to call the new `POST /colleges` endpoint.

## Decision

A real row in `tenants`: name "IntroBuddy Platform", slug `platform`, created idempotently by `findOrCreatePlatformTenant()` (`apps/api/src/db/tenants.ts`) rather than by a migration — both existing migrations are pure schema DDL with zero business-data inserts, and introducing a data-inserting migration would be the first violation of that convention. Every `super_admin`'s `college_users` row anchors to this tenant via the ordinary FK. Their login is then just an ordinary login (`tenantSlug: "platform"`) through the completely unmodified auth machinery (`resolveSession`, `withTenant`, the compound-token scheme). Cross-tenant privilege — creating other colleges — is purely a permission check (`COLLEGE_CREATE`), never a session-shape special case: nothing in `hasPermission`/`ROLE_PERMISSIONS` (`packages/shared/src/permissions.ts`) consults `tenant_id` at all.

The very first super_admin is provisioned by a new idempotent ops script, `apps/api/src/scripts/bootstrapSuperAdmin.ts`, which calls the same `provisionInvitation()` every other invitation uses, scoped to the platform tenant, and sends the same kind of invitation email. There is no HTTP route for this, and there shouldn't be one — consistent with a comment already present in `permissions.ts` before this milestone: "Inviting a super_admin isn't part of this map at all — that stays out of API scope (ops/seed only)." The recipient activates through the ordinary, unmodified `/auth/activate` flow, consistent with "invitation links, never temporary passwords" (spec 14.1 #5).

**Rejected alternative**: making `tenant_id` nullable for `super_admin` rows. This would force an `or tenant_id is null` branch into the RLS policy on every tenant-scoped table (ADR 0001), break `decodeCompoundToken`'s invariant that the prefix is always a valid tenant UUID (ADR 0002), and reintroduce the exact chicken-and-egg problem the compound-token design exists to avoid — a request would need to resolve "no tenant" before knowing the caller's role. High blast radius across already-shipped, already-tested code, for no benefit: nothing about authorization logic needs it.

## Does this need Supabase's service-role key?

The spec's own recommendation (section 6.4) singles out "Super Admin tenant provisioning" as a legitimate cross-tenant use of the service-role key. Tracing the actual code path: **no new use of it is required.** `tenants` carries no RLS at all (`grant select, insert, update, delete on public.tenants to app_user` already existed from Milestone 1) — inserting a new tenant needs no special privilege. `withTenant(pool, tenantId, fn)` is already generic over any `tenantId`; nothing restricts it to the caller's own session tenant, so `POST /colleges` writing a brand-new tenant's `college_users`/`invitations`/`degrees`/`departments`/`audit_log` rows the moment its id is known — via the ordinary `app_user` connection — is already-supported, ordinary usage, not a bypass of anything.

The **only** service-role call anywhere in this flow is the pre-existing `createIdentity()` (used identically by every invitation since Milestone 2, regardless of tenant, because GoTrue's `auth.users` has no tenant concept at all). Spec 6.4's recommendation turns out to already be fully satisfied by code that existed before this milestone began.

## Consequences

- Adding a college is, underneath, the same operation as inviting anyone else (`provisionInvitation`), just parameterized by a freshly generated tenant id instead of the caller's own — no duplicated transaction logic, no new authorization primitive.
- A person can hold a `college_users` row on the platform tenant *and* on an ordinary college tenant if they ever need both roles — already supported by the existing `unique(tenant_id, user_id)` schema (spec 6.5), no special-casing required.
- The "one real platform tenant" property is an operational convention (there should only ever be one, referenced by its well-known slug), not something the schema itself enforces — any tenant could theoretically host a `super_admin`. This is intentional: enforcing uniqueness at the schema level would add complexity for a guarantee ops discipline already provides.
