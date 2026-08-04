-- Optional, alumnus-controlled mentorship availability. Defaults to true so
-- every existing alumnus keeps today's implicit "available for mentorship"
-- behavior with no data migration needed beyond this column add.
alter table public.alumni_profiles
  add column mentorship_available boolean not null default true;
