-- Foundation for multi-tenancy: the tenants table, one tenant-scoped table
-- (college_users), and the row-level security policy that makes a forgotten
-- WHERE clause return zero rows instead of another tenant's data.

-- One row per college. Not itself tenant-scoped -- this table *is* the tenant.
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state text,
  city text,
  status text not null default 'provisioning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Links an identity (auth.users) to a college with a role and status.
-- One row per person per college -- see spec section 6.5.
create table public.college_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('super_admin', 'college_admin', 'student')),
  status text not null default 'invited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index college_users_tenant_id_idx on public.college_users (tenant_id);

-- Row-level security: a query without the correct transaction-local
-- tenant setting returns zero rows, never another tenant's rows.
alter table public.college_users enable row level security;

-- FORCE is required because table owners bypass RLS by default -- without
-- this, the policy exists and does nothing for whichever role owns the table.
alter table public.college_users force row level security;

-- nullif(..., '') matters: once a transaction sets this custom parameter
-- via SET LOCAL and commits, Postgres resets it to '' on that pooled
-- connection, not to NULL. Casting '' to uuid raises a hard error, so
-- without nullif, any query issued outside withTenant on a connection
-- previously used inside it would error instead of failing closed cleanly.
create policy tenant_isolation on public.college_users
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Dedicated non-owner role for the API to connect as. The migration itself
-- runs as a superuser, which always bypasses RLS regardless of FORCE --
-- so the application must never connect as that role, and never with
-- Supabase's service_role key, which bypasses RLS entirely by design.
-- Local development only: this password never leaves this machine. Staging
-- and production use a different role with credentials from a secrets store.
do $$
begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user with login password 'introbuddy_local_dev_only' noinherit;
  end if;
end
$$;

grant usage on schema public to app_user;
grant select, insert, update, delete on public.tenants to app_user;
grant select, insert, update, delete on public.college_users to app_user;
