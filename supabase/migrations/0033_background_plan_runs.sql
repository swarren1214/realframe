-- Planned builds run on the server: each step runs in its own background function call and
-- starts the next one, so a build keeps going when the page is closed, the phone locks or the
-- connection drops. The page only watches the run.

-- Characters written so far by the step that's building, for the live checklist.
alter table public.build_runs add column progress_chars int;

-- Save a run's document as a version from server code (no signed-in user in a background
-- call). The version is attributed to the person who started the run. Service role only.
create or replace function public.create_run_version(p_run uuid, p_html text, p_summary text)
returns public.versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.build_runs;
  v_next int;
  v_row public.versions;
begin
  select * into r from public.build_runs where id = p_run;
  if r.id is null then
    raise exception 'run not found' using errcode = 'P0002';
  end if;
  perform 1 from public.projects where id = r.project_id for update;
  select coalesce(max(number), 0) + 1 into v_next from public.versions where project_id = r.project_id;
  insert into public.versions (project_id, number, html, prompt, summary, source, created_by)
    values (r.project_id, v_next, p_html, r.prompt, p_summary, 'ai', r.user_id)
    returning * into v_row;
  update public.projects set updated_at = now() where id = r.project_id;
  return v_row;
end
$$;
revoke execute on function public.create_run_version(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_run_version(uuid, text, text) to service_role;
