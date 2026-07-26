-- ============================================================================
-- Phase 2: Alumni module
--
-- Adds the 'alumni' role to college_users, distinguishes student vs alumni
-- import jobs, and introduces alumni_profiles, opportunities, and requests.
-- Every new table -- and every new reference to college_users/opportunities
-- from those tables -- uses a composite (tenant_id, id) foreign key, not a
-- plain one. This is deliberate, not decorative: it's the first place in the
-- schema where a request body can legitimately name *another person's* row
-- (a student naming an alumnus, a referral request naming an opportunity),
-- so a plain FK would only be as safe as the application code that populates
-- it. The composite FK makes a cross-tenant reference fail at the database
-- regardless of what the application layer does.
--
-- Depends on 20260725145056_tenant_integrity_hardening.sql having run first
-- (it adds the (tenant_id, id) unique keys used as FK targets here).
-- ============================================================================

-- 1. Widen college_users for the alumni role.
--
-- Unlike the plan's original assumption, `role` DOES have a CHECK constraint
-- today (confirmed against the live schema): college_users_role_check =
-- role in ('super_admin', 'college_admin', 'student'). Widen it to include
-- 'alumni'.
alter table public.college_users
  drop constraint college_users_role_check,
  add constraint college_users_role_check
    check (role in ('super_admin', 'college_admin', 'student', 'alumni'));

-- What else needs to change: the existing student_fields CHECK, which today
-- structurally forbids degree_id/department_id/graduation_year on anyone
-- but a student. Alumni need them too (admin-set at import, same as
-- students, per the settled design decision).
alter table public.college_users
  drop constraint college_users_student_fields_check,
  add constraint college_users_student_fields_check
    check (
      role in ('student', 'alumni')
      or (degree_id is null and department_id is null and graduation_year is null)
    );

-- 2. import_jobs / import_mapping_presets: distinguish student vs alumni
-- imports. Everything else about the six-phase workflow (upload, mapping,
-- validate, commit, invite) is reused unchanged -- only the target role
-- is new, threaded through from creation to the worker's commit branch.
alter table public.import_jobs
  add column target_role text not null default 'student'
    check (target_role in ('student', 'alumni'));

-- One mapping preset per (tenant, import shape) rather than per tenant --
-- student and alumni imports have different columns to remember, so a
-- single tenant-keyed preset can no longer serve both.
alter table public.import_mapping_presets
  drop constraint import_mapping_presets_pkey,
  add column target_role text not null default 'student'
    check (target_role in ('student', 'alumni')),
  add constraint import_mapping_presets_pkey primary key (tenant_id, target_role);
-- Existing rows get target_role='student' via the default -- correct, since
-- student import was the only kind that existed before this migration.

-- 3. alumni_profiles -- self-authored content, 1:1 with college_users.
-- Same shape and grant pattern as student_profiles: no delete grant, a
-- profile is upserted, never removed.
create table public.alumni_profiles (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  college_user_id     uuid not null unique,
  avatar_path         text,
  bio                 text,
  phone               text,
  linkedin_url        text,
  github_url          text,
  company             text,
  job_title           text,
  skills              text[],
  country             text,
  city                text,
  years_of_experience int,
  work_email          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint alumni_profiles_college_user_tenant_fkey
    foreign key (tenant_id, college_user_id) references public.college_users(tenant_id, id)
);

create index alumni_profiles_tenant_id_idx on public.alumni_profiles(tenant_id);
-- Supports "filter by company" on the admin alumni list and the student-
-- facing directory. Raw text for now (a normalized company entity can layer
-- on top of this column later without a schema change to this table).
create index alumni_profiles_company_idx on public.alumni_profiles(tenant_id, lower(company));

alter table public.alumni_profiles enable row level security;
alter table public.alumni_profiles force row level security;
create policy tenant_isolation on public.alumni_profiles
  for all
  using       (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update on public.alumni_profiles to app_user;

-- 4. opportunities -- job / internship / referral postings by alumni.
-- One table with a type column, matching the existing
-- certifications.type precedent (workshop/internship/course) rather than
-- three near-identical tables.
create table public.opportunities (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id),
  posted_by_college_user_id uuid not null,
  type                      text not null check (type in ('job', 'internship', 'referral')),
  title                     text not null,
  description               text,
  company                   text,
  location                  text,
  apply_url                 text,
  deadline                  date,
  status                    text not null default 'open'
                              check (status in ('open', 'closed', 'expired')),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint opportunities_posted_by_tenant_fkey
    foreign key (tenant_id, posted_by_college_user_id) references public.college_users(tenant_id, id),
  -- FK target for requests.opportunity_id below.
  constraint opportunities_tenant_id_key unique (tenant_id, id)
);

create index opportunities_tenant_id_idx on public.opportunities(tenant_id);
create index opportunities_tenant_type_idx on public.opportunities(tenant_id, type, status);
create index opportunities_posted_by_idx on public.opportunities(posted_by_college_user_id);

alter table public.opportunities enable row level security;
alter table public.opportunities force row level security;
create policy tenant_isolation on public.opportunities
  for all
  using       (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on public.opportunities to app_user;

-- 5. requests -- a student's ask to a specific alumnus. Simple accept/
-- decline + one response message for v1, no thread table.
create table public.requests (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id),
  student_college_user_id  uuid not null,
  alumnus_college_user_id  uuid not null,
  type                     text not null check (type in ('mentorship', 'referral')),
  opportunity_id           uuid,
  message                  text not null,
  status                   text not null default 'pending'
                             check (status in ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  response_message         text,
  responded_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- The three composite FKs below are the actual point of this migration:
  -- a request naming an alumnus, or an opportunity, that belongs to a
  -- different tenant than the request itself now fails at INSERT time,
  -- unconditionally, regardless of what the API layer does or doesn't check.
  constraint requests_student_tenant_fkey
    foreign key (tenant_id, student_college_user_id) references public.college_users(tenant_id, id),
  constraint requests_alumnus_tenant_fkey
    foreign key (tenant_id, alumnus_college_user_id) references public.college_users(tenant_id, id),
  constraint requests_opportunity_tenant_fkey
    foreign key (tenant_id, opportunity_id) references public.opportunities(tenant_id, id),

  -- Referral requests must reference a posting; mentorship requests never
  -- do. Note what this CHECK can't do: it can't verify the referenced
  -- opportunity is itself type='referral' rather than a job or internship
  -- posting -- a CHECK constraint can't reach into another table. That one
  -- rule stays an application-layer check in POST /requests, consistent
  -- with this codebase's existing zero-trigger convention.
  constraint requests_referral_needs_opportunity check (
    (type = 'referral'   and opportunity_id is not null) or
    (type = 'mentorship' and opportunity_id is null)
  )
);

create index requests_tenant_id_idx on public.requests(tenant_id);
create index requests_student_idx   on public.requests(tenant_id, student_college_user_id);
create index requests_alumnus_idx   on public.requests(tenant_id, alumnus_college_user_id);

alter table public.requests enable row level security;
alter table public.requests force row level security;
create policy tenant_isolation on public.requests
  for all
  using       (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update on public.requests to app_user;
-- No delete grant, matching student_profiles/certifications' convention for
-- records that should be superseded by a status change, not removed.
-- Ownership within a tenant (a student seeing only their own sent requests;
-- an alumnus only their own received ones) is an application-layer check,
-- exactly the precedent already set by certifications -- RLS isolates
-- tenants, the app layer isolates rows within a tenant.

-- 6. Platform dashboard: generalize the per-tenant counts function to cover
-- both students and alumni, rather than adding a near-duplicate.
-- SECURITY DEFINER, same narrow pattern as the existing functions --
-- returns grouped counts only, never row-level data.
create or replace function public.get_college_user_counts_by_tenant()
returns table(tenant_id uuid, role text, total_count bigint, active_count bigint)
language sql security definer set search_path = public
as $$
  select tenant_id, role,
         count(*) as total_count,
         count(*) filter (where status = 'active') as active_count
  from public.college_users
  where role in ('student', 'alumni')
  group by tenant_id, role;
$$;

grant execute on function public.get_college_user_counts_by_tenant() to app_user;

-- get_student_counts_by_tenant() is intentionally left in place, unchanged.
-- GET /colleges migrates to the generalized function above; the old
-- one can be dropped in a later migration once nothing calls it, rather
-- than risk breaking a call site in this one.
