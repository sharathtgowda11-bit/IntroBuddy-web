# 4. Rate limiting via a Postgres table instead of Redis

Status: Accepted (Milestone 2)

## Context

Spec section 14.1 (#14) requires rate limiting on login, password-reset, and activation endpoints. The system architecture (spec section 5.5) already explicitly rules out Redis at this scale ("Postgres job table is sufficient and simpler... reconsider at sustained queue depth") for the background job queue; the same reasoning applies to rate-limit counters. An in-process counter (a plain JS `Map`, say) was also considered and rejected: it silently stops being correct the moment the API runs as more than one replica, since each replica would count independently.

## Decision

A plain Postgres table, `public.rate_limit_hits (bucket text, window_start timestamptz, hit_count int, primary key (bucket, window_start))`, incremented with a single upsert per request (`apps/api/src/db/rateLimits.ts`):

```sql
insert into public.rate_limit_hits (bucket, window_start, hit_count)
values ($1, $2, 1)
on conflict (bucket, window_start) do update set hit_count = rate_limit_hits.hit_count + 1
returning hit_count;
```

`bucket` is an application-defined key such as `login:<ip>`. This table is **not** tenant-scoped and carries no RLS — it's pure operational bookkeeping, not business data, consistent with `tenants` itself being the one other table with no tenant_id (ADR 0001).

## Consequences

- Correct regardless of how many API replicas are running, with no new infrastructure component to operate.
- One extra write per rate-limited request; acceptable at the request volumes this product targets (spec section 2: 50-100 req/s on a bad day).
- Fixed-window counting (not sliding-window or token-bucket) — simpler, and sufficient for the abuse pattern being defended against (repeated login/reset/activation attempts), not a precision-timing requirement.
- Should sustained queue depth or contention on this table ever become a measured problem, the spec's own reconsideration trigger for introducing Redis ("sustained queue depth") applies equally here.
