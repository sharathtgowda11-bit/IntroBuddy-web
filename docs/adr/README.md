# Architecture Decision Records

One file per significant, hard-to-reverse decision. Each is short: context, decision, consequences, alternatives considered. Status is `Accepted` unless noted otherwise. Don't edit a past ADR to reflect a later change of mind — write a new one and mark the old one Superseded, so the history of *why* stays intact.

| # | Decision | Status |
|---|---|---|
| [0001](0001-multi-tenant-isolation-shared-db-rls.md) | Multi-tenant isolation via shared database + Postgres RLS | Accepted |
| [0002](0002-first-party-session-tokens.md) | First-party compound session tokens instead of trusting Supabase Auth's JWT for tenant/role | Accepted |
| [0003](0003-permission-based-authorization.md) | Data-driven, permission-based authorization instead of role-string checks | Accepted |
| [0004](0004-postgres-backed-rate-limiting.md) | Rate limiting via a Postgres table instead of Redis | Accepted |
| [0005](0005-generic-smtp-deferred-provider.md) | Outbound email via generic SMTP, provider selection deferred | Accepted |
| [0006](0006-breached-password-check-fail-open.md) | Breached-password check via HaveIBeenPwned k-anonymity, fails open | Accepted |
