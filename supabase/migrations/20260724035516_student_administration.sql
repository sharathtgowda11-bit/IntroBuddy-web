-- Milestone 6: administration. Search (spec 5.5/13's own stated choice --
-- Postgres full-text with pg_trgm, explicitly instead of Elasticsearch),
-- and a third college_users status for deactivation.

create extension if not exists pg_trgm;

-- Login already blocks any non-'active' status (apps/api/src/routes/auth.ts),
-- so adding 'deactivated' here is the only change needed to make
-- deactivation actually take effect.
alter table public.college_users drop constraint college_users_status_check;
alter table public.college_users
  add constraint college_users_status_check check (status in ('invited', 'active', 'deactivated'));

create index college_users_name_trgm_idx on public.college_users using gin (name gin_trgm_ops);
create index college_users_email_trgm_idx on public.college_users using gin (email gin_trgm_ops);
create index college_users_usn_trgm_idx on public.college_users using gin (usn gin_trgm_ops);
