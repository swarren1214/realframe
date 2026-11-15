-- Reference images and PDFs attached to prompts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('references', 'references', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

-- A reference lives under its prototype ("<project id>/...") or, before the
-- prototype exists, under the uploader's own folder ("pending/<user id>/...").
create or replace function public.can_use_reference(p_name text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select case
    when (storage.foldername(p_name))[1] = 'pending'
      then (storage.foldername(p_name))[2] = auth.uid()::text
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then coalesce(
        public.project_role(((storage.foldername(p_name))[1])::uuid) in ('owner', 'editor'),
        false)
    else false
  end
$$;
revoke execute on function public.can_use_reference(text) from public, anon;
grant execute on function public.can_use_reference(text) to authenticated;

create policy "references: builders upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'references' and public.can_use_reference(name));
create policy "references: builders read" on storage.objects
  for select to authenticated using (bucket_id = 'references' and public.can_use_reference(name));

-- What a chat message had attached, and what a planned build should see.
alter table public.messages add column attachments jsonb not null default '[]'::jsonb;
alter table public.build_runs add column "references" jsonb not null default '[]'::jsonb;
