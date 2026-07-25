# IntroBuddy

Multi-tenant alumni management platform. Colleges are the paying customer; students and alumni use the product for free.

Full technical specification: `IntroBuddy-Phase1-Specification.pdf` (not in this repo — see project owner). It covers architecture, tenancy model, workflows, email, deployment, security, and cost. Read it before making any change to tenancy, auth, or the import pipeline.

## Structure

```
supabase/              Postgres migrations, local config, seed data
packages/db/           Postgres client, tenant-context (SET LOCAL) wrapper (withTenant)
packages/shared/       Shared types, the permission matrix, and zod request schemas
packages/import/       Pure CSV/XLSX parsing, column-mapping guessing, row validation
packages/invitations/  Compound tokens, identity provisioning, invitation/email helpers
packages/jobs/         Postgres job queue + import-job persistence (shared by api + worker)
apps/api/              REST API monolith — all business logic, auth, RLS-backed tenant isolation
apps/worker/           Background worker — bulk import commit, invitation sending
apps/web/              React SPA — super admin, college admin, and student interfaces
```

## Documentation

Full technical documentation lives in **[`docs/`](docs/README.md)**:

- **[docs/architecture.md](docs/architecture.md)** — system, frontend, backend, DB, worker, auth, multi-tenancy, storage; request & session lifecycles.
- **[docs/database.md](docs/database.md)** — every table (columns, constraints, FKs, indexes, RLS, examples), the ER diagram, and SQL / `SECURITY DEFINER` functions.
- **[docs/workflows.md](docs/workflows.md)** — Mermaid sequence diagrams for every Super Admin / College Admin / Student / Worker / Dashboard workflow.
- **[docs/security.md](docs/security.md)** — multi-tenancy, RLS, password/identity, HIBP, rate limiting, sessions, audit logging, authorization.
- **[docs/adr/](docs/adr/README.md)** — Architecture Decision Records (context, decision, consequences, alternatives). Read these before revisiting tenancy, session/token design, authorization, or infrastructure choices already made there.

## The one rule that matters most

Tenant identity is **always** derived from the authenticated session, **never** from a request header, URL parameter, or request body. Every tenant-scoped query relies on Postgres row-level security via a transaction-local `app.tenant_id` setting (`SET LOCAL`, never plain `SET`). See `packages/db` for the implementation and the isolation test that guards it in CI.

## Local development

```
npm install
npm run db:start   # requires Docker Desktop running
```
