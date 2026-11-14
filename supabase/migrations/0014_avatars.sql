-- Profile photos. Stored under avatars/<user id>/, publicly readable by URL (file names are random).
alter table public.profiles add column avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do nothing;

create policy "avatars: upload your own" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: replace your own" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: remove your own" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Names and photos of the people on a team, for teammates only.
create or replace function public.team_profiles(t uuid)
returns table (user_id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_url
  from public.team_members m join public.profiles p on p.id = m.user_id
  where m.team_id = t and public.team_role(t) is not null
$$;
revoke execute on function public.team_profiles(uuid) from public, anon;
grant execute on function public.team_profiles(uuid) to authenticated;
