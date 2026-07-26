-- ============================================================================
-- Tenant-integrity hardening
--
-- Standalone from the alumni feature work in the next migration. Fixes a gap
-- found while auditing the schema for Phase 2: college_users.degree_id and
-- .department_id, and departments.degree_id, are plain foreign keys to
-- degrees(id)/departments(id) -- valid regardless of tenant. Nothing in the
-- schema itself stops a row from pointing at another tenant's taxonomy if the
-- resolving application code ever had a bug. RLS doesn't help here: RLS
-- governs which rows a session can see, not what a foreign key on an
-- already-tenant-scoped INSERT is allowed to reference.
--
-- This migration closes that at the database level, the same way the
-- Phase 2 tables will from day one (see 20260725150000_alumni_module.sql).
--
-- Constraint names below were confirmed against the live schema
-- (pg_constraint) before writing this migration:
--   college_users_degree_id_fkey, college_users_department_id_fkey,
--   departments_degree_id_fkey -- all Postgres default names, since the
--   original migrations added these FKs inline/unnamed.
-- ============================================================================

-- 1. (tenant_id, id) unique keys, needed as composite FK targets.
-- Purely additive: id is already globally unique via the primary key, so
-- (tenant_id, id) is trivially unique too. Safe to add on populated tables.
alter table public.college_users
  add constraint college_users_tenant_id_key unique (tenant_id, id);

alter table public.degrees
  add constraint degrees_tenant_id_key unique (tenant_id, id);

alter table public.departments
  add constraint departments_tenant_id_key unique (tenant_id, id);

-- 2. Harden college_users -> degrees / departments.
-- MATCH SIMPLE (the default) means a NULL degree_id/department_id still
-- satisfies the constraint trivially, so this doesn't disturb non-student,
-- non-alumni rows, which are required to have both null.
alter table public.college_users
  drop constraint college_users_degree_id_fkey,
  add constraint college_users_degree_id_tenant_fkey
    foreign key (tenant_id, degree_id) references public.degrees(tenant_id, id);

alter table public.college_users
  drop constraint college_users_department_id_fkey,
  add constraint college_users_department_id_tenant_fkey
    foreign key (tenant_id, department_id) references public.departments(tenant_id, id);

-- 3. Harden departments -> degrees the same way.
alter table public.departments
  drop constraint departments_degree_id_fkey,
  add constraint departments_degree_id_tenant_fkey
    foreign key (tenant_id, degree_id) references public.degrees(tenant_id, id);

-- No RLS changes in this migration -- the tenant_isolation policy on both
-- tables is unaffected; this only tightens what a *within-tenant* row is
-- allowed to point at.
