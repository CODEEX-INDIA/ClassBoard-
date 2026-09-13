alter table public.upload_sessions
  alter column expires_at set default (now() + interval '24 hours');

create or replace function public.cleanup_expired_upload_sessions()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.upload_sessions
  where expires_at <= now();
$$;

revoke all on function public.cleanup_expired_upload_sessions() from public;
grant execute on function public.cleanup_expired_upload_sessions() to service_role;

-- Run cleanup hourly when pg_cron is enabled in the Supabase project.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'classboard-cleanup-expired-upload-sessions',
      '0 * * * *',
      'select public.cleanup_expired_upload_sessions()'
    );
  end if;
exception when unique_violation then
  null;
end $$;
