-- GitHub import, phase 1: connect a GitHub App installation, link a repository to a
-- prototype, and build it in a sandbox into a 'bundle' version.

-- Server-only settings (the GitHub App's credentials, created through the manifest flow).
-- RLS on with no policies: only the service role can read or write.
create table public.app_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;

-- A GitHub App installation that a Realframe user has proven they can access.
create table public.github_installations (
  id bigint primary key,
  account_login text not null,
  account_type text not null,
  added_by uuid not null references auth.users on delete cascade,
  suspended_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.github_installations enable row level security;
create policy "see installations you added" on public.github_installations
  for select to authenticated using (added_by = auth.uid());

-- What a prototype builds from. One source per prototype; a repository can feed many.
create table public.project_sources (
  project_id uuid primary key references public.projects on delete cascade,
  installation_id bigint not null references public.github_installations on delete cascade,
  repo_id bigint not null,
  repo_full_name text not null,
  branch text not null,
  root_dir text not null default '',
  install_command text,
  build_command text,
  output_dir text not null,
  framework text,
  build_on_push boolean not null default true,
  publish_on_push boolean not null default true,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_sources_repo_idx on public.project_sources (repo_id, branch);
alter table public.project_sources enable row level security;
create policy "editors see the source" on public.project_sources
  for select to authenticated using (public.project_role(project_id) in ('owner', 'editor'));

create table public.builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  requested_by uuid references auth.users on delete set null,
  billed_to uuid references auth.users on delete set null,
  repo_full_name text not null,
  branch text not null,
  commit_sha text,
  commit_message text,
  commit_author text,
  trigger text not null check (trigger in ('import', 'push', 'manual', 'retry')),
  status text not null default 'queued' check (status in ('queued', 'building', 'succeeded', 'failed', 'canceled')),
  error_summary text,
  log text not null default '',
  version_id uuid references public.versions on delete set null,
  sandbox_id text,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index builds_project_idx on public.builds (project_id, queued_at desc);
create index builds_billed_idx on public.builds (billed_to, started_at);
alter table public.builds enable row level security;
create policy "editors see builds" on public.builds
  for select to authenticated using (public.project_role(project_id) in ('owner', 'editor'));

-- Versions remember the commit they were built from.
alter table public.versions drop constraint versions_source_check;
alter table public.versions
  add constraint versions_source_check check (source in ('ai', 'restore', 'edit', 'variant', 'import', 'github'));
alter table public.versions
  add column commit_sha text,
  add column commit_message text,
  add column commit_author text;

-- Called by the build runner (service role) when a build succeeds.
create or replace function public.create_build_version(
  p_project uuid, p_bundle uuid, p_files int, p_bytes bigint, p_summary text,
  p_sha text, p_message text, p_author text, p_created_by uuid
)
returns public.versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next int;
  v_row public.versions;
begin
  perform 1 from public.projects where id = p_project for update;
  select coalesce(max(number), 0) + 1 into v_next from public.versions where project_id = p_project;
  insert into public.versions (project_id, number, html, prompt, summary, source, created_by, kind,
                               bundle_id, bundle_files, bundle_bytes, commit_sha, commit_message, commit_author)
    values (p_project, v_next, '', null, p_summary, 'github', p_created_by, 'bundle',
            p_bundle, p_files, p_bytes, p_sha, p_message, p_author)
    returning * into v_row;
  update public.projects set updated_at = now() where id = p_project;
  return v_row;
end
$$;
revoke execute on function public.create_build_version(uuid, uuid, int, bigint, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_build_version(uuid, uuid, int, bigint, text, text, text, text, uuid) to service_role;
