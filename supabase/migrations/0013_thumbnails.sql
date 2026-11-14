-- Screenshot thumbnails of each prototype's latest version, for the prototype picker.
alter table public.projects
  add column thumbnail_path text,
  add column thumbnail_version_id uuid,
  add column thumbnail_requested_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit) values ('thumbnails', 'thumbnails', false, 2097152)
  on conflict (id) do nothing;

-- The newest version of each of the given prototypes the caller can see.
create or replace function public.latest_versions(p_ids uuid[])
returns table (project_id uuid, version_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (v.project_id) v.project_id, v.id
  from public.versions v
  where v.project_id = any(p_ids)
  order by v.project_id, v.number desc
$$;
grant execute on function public.latest_versions(uuid[]) to authenticated;
