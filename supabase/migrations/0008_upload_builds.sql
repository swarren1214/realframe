-- Builds can also come from an uploaded source zip instead of a GitHub repository.
alter table public.builds
  alter column repo_full_name drop not null,
  alter column branch drop not null,
  add column upload_path text,
  add column settings jsonb;
alter table public.builds
  add constraint builds_origin_check check (upload_path is not null or repo_full_name is not null);
