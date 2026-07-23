# 8. The audit log is written atomically with the action it records

Status: Accepted (Milestone 3)

## Context

Spec section 14.1 (#11) and section 12.6 require an audit log on every administrative action — actor, tenant, action, target, timestamp, IP address — and name "Super Admin creates a college" specifically as an action that needs one (spec 8.1, step 8). A missing or incomplete audit trail is a compliance and accountability gap: spec section 12.6 calls it out as "the only thing that settles the question" when a placement officer disputes having taken some action.

## Decision

`writeAuditLog()` (`apps/api/src/db/auditLog.ts`) is always called from *inside* the same `withTenant(...)` transaction as the action it records — in `POST /colleges`, the tenant insert, the default-taxonomy seed, the admin invitation, and the audit log row all commit together or not at all. There is no best-effort, fire-and-forget logging path anywhere in this codebase.

`audit_log` also gets a narrower grant than every other table: `grant select, insert` to `app_user`, deliberately omitting `update` and `delete` (every other tenant-scoped table's grant is the same copy-pasted `select, insert, update, delete`; this one isn't, on purpose). The table's entire purpose is an immutable record, so the schema itself removes the ability for a future code bug to quietly edit or erase history — not just a documented convention, but something Postgres enforces regardless of what the application code does.

**Deliberate contrast with ADR 0006**: the breached-password check fails *open* — a third-party outage must not block a legitimate activation or reset, and a skipped check just means one already-optional defensive layer didn't run this one time. A missing audit log entry is not the same kind of failure. There's no acceptable fallback for "we don't actually know who created this college" — so unlike the breach check, this one has no failure-open path at all: if the audit insert fails, the whole transaction rolls back, including the college creation itself.

## Consequences

- Creating a college can never silently succeed without a corresponding audit trail — the two are the same commit.
- `actor_college_user_id` uses `on delete set null`, not `cascade` (see the migration): the historical record survives the actor's own account being removed later, rather than disappearing with it.
- The audit row's `tenant_id` is the tenant the action was performed *against*, and `actor_college_user_id` may legitimately point into a *different* tenant's `college_users` row (a super_admin on the platform tenant, acting on a newly created college) — already a precedented pattern, since `invitations.invited_by` has no tenant-matching constraint either.
- This milestone only wires up the one call site spec 8.1 names explicitly (`college.create`). `action`/`target_type` are left as plain `text`, not a constrained enum, specifically so future call sites (Milestone 6's audit log viewer will want several more) don't each require a migration to add a new enum value.
