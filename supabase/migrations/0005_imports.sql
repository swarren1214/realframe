-- Imported prototypes: single files become ordinary HTML versions (source 'import');
-- built apps (a zip of static files) become 'bundle' versions served from the content domain.

alter table public.versions drop constraint versions_source_check;
alter table public.versions
  add constraint versions_source_check check (source in ('ai', 'restore', 'edit', 'variant', 'import'));

alter table public.versions
  add column kind text not null default 'html' check (kind in ('html', 'bundle')),
  add column bundle_id uuid,
  add column bundle_files int,
  add column bundle_bytes bigint,
  add constraint versions_bundle_check check ((kind = 'bundle') = (bundle_id is not null));

-- Private bucket; files live at <project id>/<bundle id>/<path>. The server reads them with the service role.
insert into storage.buckets (id, name, public, file_size_limit)
values ('bundles', 'bundles', false, 26214400)
on conflict (id) do nothing;

-- Owners and editors upload straight from the browser into their project's folder.
create policy "editors upload bundle files" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bundles'
    and public.project_role(((storage.foldername(name))[1])::uuid) in ('owner', 'editor')
  );

-- A new version that points at an uploaded bundle.
create or replace function public.create_bundle_version(
  p_project uuid, p_bundle uuid, p_files int, p_bytes bigint, p_summary text, p_source text default 'import'
)
returns public.versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project);
  v_next int;
  v_row public.versions;
begin
  if auth.uid() is null or v_role is null or v_role not in ('owner', 'editor') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_source not in ('import', 'restore') then
    raise exception 'bad source';
  end if;
  perform 1 from public.projects where id = p_project for update;
  select coalesce(max(number), 0) + 1 into v_next from public.versions where project_id = p_project;
  insert into public.versions (project_id, number, html, prompt, summary, source, created_by, kind, bundle_id, bundle_files, bundle_bytes)
    values (p_project, v_next, '', null, p_summary, p_source, auth.uid(), 'bundle', p_bundle, p_files, p_bytes)
    returning * into v_row;
  update public.projects set updated_at = now() where id = p_project;
  return v_row;
end
$$;

revoke execute on function public.create_bundle_version(uuid, uuid, int, bigint, text, text) from public, anon;
grant execute on function public.create_bundle_version(uuid, uuid, int, bigint, text, text) to authenticated;
