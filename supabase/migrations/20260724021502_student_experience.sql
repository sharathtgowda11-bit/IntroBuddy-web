-- Milestone 5: student experience. Consent (spec 3.4, 8.4, 14.1 #12),
-- self-authored profile data, and certifications -- each split into its
-- own table, separate from college_users, since college-managed and
-- self-authored data have distinct permissions (spec 9.1).

-- One row per (student, activation) -- captured at first login, never
-- overwritten later. policy_version is stamped server-side (see
-- apps/api/src/db/consents.ts's CURRENT_POLICY_VERSION), never accepted
-- as client input.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  college_user_id uuid not null references public.college_users(id),
  policy_version text not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index consents_college_user_id_idx on public.consents (college_user_id);
create index consents_tenant_id_idx on public.consents (tenant_id);

alter table public.consents enable row level security;
alter table public.consents force row level security;

create policy tenant_isolation on public.consents
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert on public.consents to app_user;

-- Self-authored profile content. One-to-one with college_users via the
-- unique college_user_id. Profile "complete" status is computed by the
-- caller (avatar + linkedin both present), never stored here.
create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  college_user_id uuid not null unique references public.college_users(id),
  avatar_path text,
  linkedin_url text,
  github_url text,
  resume_path text,
  bio text,
  skills text,
  interests text,
  achievements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index student_profiles_tenant_id_idx on public.student_profiles (tenant_id);

alter table public.student_profiles enable row level security;
alter table public.student_profiles force row level security;

create policy tenant_isolation on public.student_profiles
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert, update on public.student_profiles to app_user;

-- Repeatable per student (spec 8.4's profile fields table).
create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  college_user_id uuid not null references public.college_users(id),
  name text not null,
  type text not null check (type in ('workshop', 'internship', 'course')),
  issuing_organisation text not null,
  date date,
  certificate_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index certifications_college_user_id_idx on public.certifications (college_user_id);
create index certifications_tenant_id_idx on public.certifications (tenant_id);

alter table public.certifications enable row level security;
alter table public.certifications force row level security;

create policy tenant_isolation on public.certifications
  for all
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert, update, delete on public.certifications to app_user;
