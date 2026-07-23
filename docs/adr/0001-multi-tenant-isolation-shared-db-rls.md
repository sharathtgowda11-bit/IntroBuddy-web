# 1. Multi-tenant isolation via shared database + Postgres RLS

Status: Accepted (Milestone 1)

## Context

IntroBuddy is a B2B SaaS serving multiple colleges (tenants) from one deployment. The one property that must never fail is: a bug in application code must not be able to return one college's data to another. At the scale this product targets (5-15 colleges, ~75,000 student accounts total — see the Phase 1 spec, section 2), a full database-per-tenant or schema-per-tenant model was also considered, but rejected: it multiplies migration and connection-pooling overhead per customer sold, and makes cross-tenant analytics (wanted for product/investor metrics) difficult, for an isolation benefit achievable more cheaply another way.

## Decision

One shared Postgres database. Every tenant-scoped table carries a `tenant_id` column and a **Postgres row-level security (RLS)** policy comparing `tenant_id` to a transaction-local setting:

```sql
alter table public.<table> enable row level security;
alter table public.<table> force row level security;

create policy tenant_isolation on public.<table>
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

Three implementation details make this actually hold under pressure, not just in the happy path:

1. **The app connects as a dedicated non-owner role (`app_user`), never the table owner and never Supabase's `service_role` key.** Table owners and superusers bypass RLS regardless of `FORCE ROW LEVEL SECURITY`; the service-role key bypasses RLS entirely by design. Using either would make every other layer decorative.
2. **The tenant setting is applied with `SELECT set_config('app.tenant_id', $1, true)`** (the parameterized equivalent of `SET LOCAL`) inside a transaction, via `packages/db`'s `withTenant()` wrapper — never a session-level `SET`. A session-level `SET` on a pooled connection would silently leak one tenant's context into the next, unrelated request that happens to reuse the same physical connection.
3. **The policy uses `nullif(current_setting(...), '')`, not the bare setting.** Discovered while writing Milestone 2: Postgres resets a custom GUC placeholder to an *empty string*, not `NULL`, once the transaction that first set it via `SET LOCAL` commits. Casting `''::uuid` throws. Without `nullif`, any query issued outside `withTenant` on a connection previously used inside it would hard-error instead of the intended "zero rows, fail closed."

A dedicated database can still be carved out later for a single enterprise customer who contractually demands it — a per-customer exception, not the default.

## Consequences

- A forgotten `WHERE tenant_id = ...` clause returns zero rows, never another tenant's data — isolation is a property of the database, not of every developer remembering to filter correctly.
- Every new tenant-scoped table must repeat this exact pattern (FORCE RLS + policy + grant to `app_user`) — there is no shortcut and no table gets a silent exception, including tables added for auth (Milestone 2's `invitations`, `password_resets`, `sessions`).
- A single automated test (`packages/db/src/withTenant.test.ts`) creates two tenants and asserts a query scoped to one never returns the other's rows. It runs in CI on every push and must never be skipped or deleted (spec section 6.6).
- `tenants` itself carries no `tenant_id` and no RLS policy — it *is* the tenant, and is queried directly against the plain pool.
