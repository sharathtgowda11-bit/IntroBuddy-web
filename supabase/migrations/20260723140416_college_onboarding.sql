-- Relaxes invitations.invited_by to nullable: the super-admin bootstrap
-- script has no human inviter, unlike every ordinary invitation.
alter table public.invitations alter column invited_by drop not null;

-- Gap noticed while implementing this milestone: college_users had no
-- column for a person's name anywhere, yet spec 8.4 lists Name as a
-- college-managed field and spec 8.1's college-creation flow explicitly
-- collects the admin's name. Nullable: only the college-creation flow
-- populates it for now (the plain POST /invitations schema doesn't
-- collect a name yet -- a pre-existing gap from Milestone 2, left for a
-- later milestone to close properly rather than expanding this one).
alter table public.college_users add column name text;

-- College profile fields. logo_path/banner_path are storage *paths*, not
-- URLs -- the bucket is private and URLs are signed fresh on every read
-- (see apps/api/src/lib/storage.ts), never persisted.
alter table public.tenants add column logo_path text;
alter table public.tenants add column banner_path text;
alter table public.tenants add column description text;
alter table public.tenants add column contact_email text;
alter table public.tenants add column contact_phone text;

alter table public.tenants
  add constraint tenants_status_check check (status in ('provisioning', 'active', 'suspended'));

create table public.degrees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index degrees_tenant_name_idx on public.degrees (tenant_id, lower(name));
create index degrees_tenant_id_idx on public.degrees (tenant_id);

alter table public.degrees enable row level security;
alter table public.degrees force row level security;

create policy tenant_isolation on public.degrees
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Plain FK RESTRICT (Postgres default): deleting a degree with
-- departments still attached blocks at the database level. The API
-- route catches error 23503 and returns 409. Deliberately NOT guarding
-- against attached *students* here -- college_users has no degree_id or
-- department_id column yet (that lands with student import, Milestone
-- 4/5), so no row could reference a department today regardless.
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  degree_id uuid not null references public.degrees(id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index departments_tenant_degree_name_idx on public.departments (tenant_id, degree_id, lower(name));
create index departments_tenant_id_idx on public.departments (tenant_id);

alter table public.departments enable row level security;
alter table public.departments force row level security;

create policy tenant_isolation on public.departments
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Audit log: an immutable record of administrative actions (spec 14.1
-- #11, 12.6). actor_college_user_id uses ON DELETE SET NULL, not
-- CASCADE -- the historical record must survive the actor's own account
-- being removed later. tenant_id is the tenant the action was performed
-- against, which may differ from the actor's own tenant (e.g. a
-- super_admin on the platform tenant creating a college elsewhere) --
-- already a precedented pattern: invited_by has no tenant-matching
-- constraint either.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  actor_college_user_id uuid references public.college_users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index audit_log_tenant_id_idx on public.audit_log (tenant_id);

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;

create policy tenant_isolation on public.audit_log
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert, update, delete on public.degrees to app_user;
grant select, insert, update, delete on public.departments to app_user;
-- Deliberately no update/delete: audit rows are meant to be immutable,
-- even to a future code bug in this application.
grant select, insert on public.audit_log to app_user;

-- Narrow, SECURITY DEFINER lookup into auth.users (Supabase-managed --
-- app_user otherwise has no grants there, and never should, since that
-- schema's internal columns are fragile across Supabase upgrades). This
-- exposes exactly one thing: an existing identity's id by email. Needed
-- because a person can hold one login across colleges (spec 6.5): if
-- they already have an auth.users row from another tenant, GoTrue's
-- createUser call for a new invitation elsewhere fails with
-- "email_exists" and its own Admin API has no way to look up the
-- existing id by email (confirmed empirically -- listUsers has no email
-- filter). This function is that lookup, minimized to a single column.
create or replace function public.find_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

grant execute on function public.find_auth_user_id_by_email(text) to app_user;
