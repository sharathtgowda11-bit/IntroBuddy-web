-- Super admin's platform dashboard needs per-college student counts
-- aggregated across every tenant at once. college_users is FORCE ROW
-- LEVEL SECURITY (tenant-scoped), so a plain cross-tenant query would
-- return zero rows for app_user under normal RLS. This mirrors the one
-- existing precedent for exactly this shape of problem (claim_next_job(),
-- student_import migration): a narrow SECURITY DEFINER function bypassing
-- RLS for exactly one query, not a bypass-RLS role or broader grant.
create or replace function public.get_student_counts_by_tenant()
returns table(tenant_id uuid, total_students bigint, active_students bigint)
language sql
security definer
set search_path = public
as $$
  select tenant_id,
         count(*) as total_students,
         count(*) filter (where status = 'active') as active_students
  from public.college_users
  where role = 'student'
  group by tenant_id
$$;

grant execute on function public.get_student_counts_by_tenant() to app_user;
