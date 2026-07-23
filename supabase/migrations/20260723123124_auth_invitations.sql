-- Adds invitation tokens, password reset tokens, first-party sessions, and
-- rate-limit bookkeeping on top of the tenancy foundation. Every new
-- tenant-scoped table follows the exact same RLS pattern as college_users:
-- FORCE ROW LEVEL SECURITY plus a policy comparing tenant_id to the
-- transaction-local app.tenant_id setting. No table gets a silent
-- exception, including the session table itself -- see apps/api's
-- resolveSession middleware for how a request establishes tenant context
-- before that policy can apply.

alter table public.tenants add column slug text not null unique;

-- Denormalized onto college_users rather than read from auth.users: the
-- app connects as app_user, which has no grants on the auth schema (owned
-- by Supabase) and shouldn't be given any. This also makes USN-to-email
-- lookup for student login possible entirely within RLS-protected tables.
alter table public.college_users add column email text not null;
alter table public.college_users add column usn text;

alter table public.college_users
  add constraint college_users_status_check check (status in ('invited', 'active'));

create unique index college_users_tenant_email_idx on public.college_users (tenant_id, lower(email));
create unique index college_users_tenant_usn_idx on public.college_users (tenant_id, usn) where usn is not null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  college_user_id uuid not null references public.college_users(id),
  token_hash text not null unique,
  invited_by uuid not null references public.college_users(id),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invitations_tenant_id_idx on public.invitations (tenant_id);

alter table public.invitations enable row level security;
alter table public.invitations force row level security;

create policy tenant_isolation on public.invitations
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create table public.password_resets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  college_user_id uuid not null references public.college_users(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index password_resets_tenant_id_idx on public.password_resets (tenant_id);

alter table public.password_resets enable row level security;
alter table public.password_resets force row level security;

create policy tenant_isolation on public.password_resets
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Our own opaque session, not GoTrue's JWT -- see the plan notes on why:
-- GoTrue has no concept of tenant, and the same person can hold sessions
-- as college_admin at one college and student at another simultaneously.
-- The token handed to the client is "<tenantId>.<32-random-bytes>": the
-- tenant_id prefix is an untrusted routing hint used only to pick which
-- RLS partition to query; only the hashed random half, checked against
-- this table, proves anything. A request must also verify the row's real
-- tenant_id matches the prefix it was looked up under.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  college_user_id uuid not null references public.college_users(id),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index sessions_tenant_id_idx on public.sessions (tenant_id);

alter table public.sessions enable row level security;
alter table public.sessions force row level security;

create policy tenant_isolation on public.sessions
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Rate-limit bookkeeping is operational, not tenant business data -- no
-- tenant_id, no RLS. bucket is an application-defined key such as
-- "login:<sha256(email)>" or "login:<ip>".
create table public.rate_limit_hits (
  bucket text not null,
  window_start timestamptz not null,
  hit_count int not null default 1,
  primary key (bucket, window_start)
);

grant select, insert, update, delete on public.invitations to app_user;
grant select, insert, update, delete on public.password_resets to app_user;
grant select, insert, update, delete on public.sessions to app_user;
grant select, insert, update, delete on public.rate_limit_hits to app_user;
