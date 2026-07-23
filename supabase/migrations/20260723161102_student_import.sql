-- Per-tenant saved column mapping so a repeat upload from the same
-- college is a single click (spec 8.3, phase 2) rather than remapping
-- headers every time.
create table public.import_mapping_presets (
  tenant_id uuid primary key references public.tenants(id),
  column_mapping jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.import_mapping_presets enable row level security;
alter table public.import_mapping_presets force row level security;

create policy tenant_isolation on public.import_mapping_presets
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- One row per uploaded file, tracking it through the six-phase workflow.
-- file_sha256 is informational only (surfaces "you already imported this"
-- as a warning), never a uniqueness constraint -- a safe re-run must be
-- able to re-upload identical content on purpose.
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  created_by_college_user_id uuid not null references public.college_users(id),
  original_filename text not null,
  file_path text not null,
  file_sha256 text not null,
  column_mapping jsonb not null default '{}',
  phase text not null default 'uploaded'
    check (phase in ('uploaded', 'mapped', 'validated', 'committing', 'committed', 'failed')),
  row_count int,
  valid_count int,
  invalid_count int,
  create_count int,
  update_count int,
  committed_row_count int,
  committed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index import_jobs_tenant_id_idx on public.import_jobs (tenant_id);

alter table public.import_jobs enable row level security;
alter table public.import_jobs force row level security;

create policy tenant_isolation on public.import_jobs
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Per-row rejection reasons -- the source for the downloadable error CSV
-- (spec 8.3, phase 4). error_reason is a single string (spec: "a CSV
-- with an error_reason column", singular): multiple issues on one row
-- join with "; ".
create table public.import_errors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number int not null,
  raw_row jsonb not null,
  error_reason text not null,
  created_at timestamptz not null default now()
);

create index import_errors_tenant_job_idx on public.import_errors (tenant_id, import_job_id);

alter table public.import_errors enable row level security;
alter table public.import_errors force row level security;

create policy tenant_isolation on public.import_errors
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Deliberately no update/delete grant below: replaced via delete+insert,
-- same immutable-record spirit as audit_log's narrower grant.

-- Generic background job queue (spec 9.1: "type, payload, attempts,
-- status"). Postgres-backed, not Redis, per this project's established
-- architecture (ADR 0004's reasoning for rate limiting applies equally
-- here). idempotency_key + the unique constraint below is what makes
-- POST /import-jobs/:id/commit safe to call twice -- the key is the
-- import_jobs.id itself, so a duplicate enqueue is a no-op.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  type text not null check (type in ('import.commit', 'invitations.send')),
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  run_after timestamptz not null default now(),
  last_error text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, type, idempotency_key)
);

create index jobs_poll_idx on public.jobs (status, run_after) where status = 'queued';

alter table public.jobs enable row level security;
alter table public.jobs force row level security;

-- Same FORCE RLS + tenant_isolation policy as every other tenant table,
-- so an ordinary tenant-scoped read (e.g. "my college's import history")
-- is protected identically to everything else. This does NOT cover the
-- worker's poll query -- see claim_next_job() below for why that's a
-- deliberate, narrow exception rather than a gap.
create policy tenant_isolation on public.jobs
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- The worker's poll loop ("claim the next queued job") is inherently
-- cross-tenant -- there is no single tenant to scope a withTenant
-- transaction to before a job is claimed. With the standard RLS policy
-- above and no tenant context set, that query would return zero rows,
-- always. This mirrors the one precedent this codebase already has for
-- exactly this shape of problem (find_auth_user_id_by_email, the
-- college_onboarding migration): a narrow SECURITY DEFINER function
-- bypassing RLS for exactly one query, not a bypass-RLS role for the
-- whole worker. Every subsequent query the worker makes -- the actual
-- business-data writes -- goes through the ordinary withTenant() path,
-- identically to apps/api.
create or replace function public.claim_next_job(p_job_types text[])
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.jobs;
begin
  select * into claimed from public.jobs
  where status = 'queued' and run_after <= now() and type = any(p_job_types)
  order by created_at
  limit 1
  for update skip locked;

  if claimed.id is not null then
    update public.jobs
    set status = 'running', attempts = attempts + 1, updated_at = now()
    where id = claimed.id
    returning * into claimed;
  end if;

  return claimed;
end;
$$;

grant execute on function public.claim_next_job(text[]) to app_user;

-- Student-specific fields. Nullable: only students have them. Both
-- degree_id and department_id are stored directly rather than derived
-- via join (spec 6.5 lists both as distinct college_users fields, and
-- this avoids a join on every profile read) -- consistency between them
-- is enforced by a single write path (packages/import's validation
-- module, always deriving degree_id from department_id server-side),
-- not a DB trigger; this project has zero trigger precedent anywhere.
alter table public.college_users add column degree_id uuid references public.degrees(id);
alter table public.college_users add column department_id uuid references public.departments(id);
alter table public.college_users add column graduation_year int;
alter table public.college_users add column source_import_job_id uuid references public.import_jobs(id);

alter table public.college_users
  add constraint college_users_student_fields_check
  check (role = 'student' or (degree_id is null and department_id is null and graduation_year is null));

grant select, insert, update, delete on public.import_mapping_presets to app_user;
grant select, insert, update, delete on public.import_jobs to app_user;
grant select, insert, delete on public.import_errors to app_user;
grant select, insert, update, delete on public.jobs to app_user;
