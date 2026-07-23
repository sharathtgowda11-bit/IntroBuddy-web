# IntroBuddy

Multi-tenant alumni management platform. Colleges are the paying customer; students and alumni use the product for free.

Full technical specification: `IntroBuddy-Phase1-Specification.pdf` (not in this repo — see project owner). It covers architecture, tenancy model, workflows, email, deployment, security, and cost. Read it before making any change to tenancy, auth, or the import pipeline.

## Structure

```
supabase/           Postgres migrations, local config, seed data
packages/db/        Postgres client, tenant-context (SET LOCAL) wrapper, shared queries
packages/shared/    Shared TypeScript types and validation
apps/api/           REST API monolith — all business logic, auth, RLS-backed tenant isolation
apps/worker/        Background worker — bulk import processing, outbound email
apps/web/           React SPA — admin and student interfaces
```

## Architecture decisions

Significant, hard-to-reverse decisions are recorded in `docs/adr/` (one file per decision: context, decision, consequences, alternatives considered). Read these before revisiting tenancy, session/token design, authorization, or infrastructure choices already made there.

## The one rule that matters most

Tenant identity is **always** derived from the authenticated session, **never** from a request header, URL parameter, or request body. Every tenant-scoped query relies on Postgres row-level security via a transaction-local `app.tenant_id` setting (`SET LOCAL`, never plain `SET`). See `packages/db` for the implementation and the isolation test that guards it in CI.

## Local development

```
npm install
npm run db:start   # requires Docker Desktop running
```
