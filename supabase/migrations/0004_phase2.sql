-- Phase 2: variants, visual editing, canvas, subdomains and password review links.

-- Versions can now come from visual edits and kept variants.
alter table public.versions drop constraint versions_source_check;
alter table public.versions
  add constraint versions_source_check check (source in ('ai', 'restore', 'edit', 'variant'));

-- Variants ---------------------------------------------------------------------
-- Alternatives generated from one prompt. Keeping one turns it into a version.
create table public.variants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  group_id uuid not null,
  position int not null,
  base_version_id uuid references public.versions(id) on delete set null,
  prompt text not null,
  html text not null,
  summary text,
  kept_version_id uuid references public.versions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, position)
);
create index variants_project_idx on public.variants (project_id, created_at desc);
create index variants_group_idx on public.variants (group_id);
alter table public.variants enable row level security;
create policy "variants: builders read" on public.variants
  for select to authenticated using (public.project_role(project_id) in ('owner', 'editor'));
create policy "variants: builders write" on public.variants
  for insert to authenticated with check (
    public.project_role(project_id) in ('owner', 'editor') and created_by = (select auth.uid())
  );
create policy "variants: builders update" on public.variants
  for update to authenticated using (public.project_role(project_id) in ('owner', 'editor'));
create policy "variants: builders delete" on public.variants
  for delete to authenticated using (public.project_role(project_id) in ('owner', 'editor'));

-- Canvas -----------------------------------------------------------------------
-- Live frames on a pan/zoom board: a screen (hash route) at a device size.
create table public.canvas_frames (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null default 'Frame' check (char_length(label) between 1 and 80),
  route text not null default '' check (char_length(route) <= 200),
  width int not null default 1280 check (width between 240 and 3840),
  height int not null default 800 check (height between 240 and 4000),
  x real not null default 0,
  y real not null default 0,
  version_id uuid references public.versions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index canvas_frames_project_idx on public.canvas_frames (project_id);
alter table public.canvas_frames enable row level security;
create policy "canvas: builders read" on public.canvas_frames
  for select to authenticated using (public.project_role(project_id) in ('owner', 'editor'));
create policy "canvas: builders insert" on public.canvas_frames
  for insert to authenticated with check (public.project_role(project_id) in ('owner', 'editor'));
create policy "canvas: builders update" on public.canvas_frames
  for update to authenticated using (public.project_role(project_id) in ('owner', 'editor'));
create policy "canvas: builders delete" on public.canvas_frames
  for delete to authenticated using (public.project_role(project_id) in ('owner', 'editor'));

-- Subdomains -------------------------------------------------------------------
-- Every slug is also a subdomain: <slug>.realframe.app. Keep infrastructure names free.
alter table public.projects add constraint projects_slug_not_reserved check (
  slug not in ('www', 'app', 'api', 'admin', 'mail', 'email', 'auth', 'login', 'billing', 'help',
               'support', 'docs', 'blog', 'status', 'cdn', 'static', 'assets', 'dashboard', 'realframe')
);

-- Password review links -----------------------------------------------------------
alter table public.projects drop constraint projects_access_mode_check;
alter table public.projects
  add constraint projects_access_mode_check check (access_mode in ('invite', 'public', 'password')),
  add column has_password boolean not null default false,
  add column guest_comments boolean not null default true;

-- Password hashes live in their own table with RLS on and no policies:
-- only security-definer functions can touch them.
create table public.project_secrets (
  project_id uuid primary key references public.projects(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.project_secrets enable row level security;
revoke all on public.project_secrets from anon, authenticated;

create or replace function public.set_project_password(p_project uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.project_role(p_project) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_password is null or char_length(p_password) < 6 or char_length(p_password) > 200 then
    raise exception 'password must be 6 to 200 characters';
  end if;
  insert into public.project_secrets (project_id, password_hash)
    values (p_project, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
    on conflict (project_id) do update set password_hash = excluded.password_hash, updated_at = now();
  update public.projects set has_password = true, access_mode = 'password' where id = p_project;
end
$$;

-- Server-only: returns the project id when the password matches a published password-mode project.
create or replace function public.check_project_password(p_slug text, p_password text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id from public.projects pr
  join public.project_secrets ps on ps.project_id = pr.id
  where pr.slug = p_slug and pr.published and pr.access_mode = 'password'
    and ps.password_hash = extensions.crypt(p_password, ps.password_hash)
$$;

-- Guests (password-link reviewers without accounts) can comment by name.
alter table public.comment_threads alter column created_by drop not null;
alter table public.comment_threads add column guest_name text check (guest_name is null or char_length(guest_name) between 1 and 60);
alter table public.comments alter column author_id drop not null;
alter table public.comments add column is_guest boolean not null default false;

-- Signed-in authors are stamped from their session; server-side guest inserts keep what they pass.
create or replace function public.set_comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
    new.author_email := coalesce(auth.jwt() ->> 'email', new.author_email);
    new.is_guest := false;
    select nullif(btrim(p.display_name), '') into new.author_name from public.profiles p where p.id = auth.uid();
  end if;
  return new;
end
$$;

revoke execute on function public.set_project_password(uuid, text) from public, anon;
grant execute on function public.set_project_password(uuid, text) to authenticated;
revoke execute on function public.check_project_password(text, text) from public, anon, authenticated;
grant execute on function public.check_project_password(text, text) to service_role;

-- Live canvas and variant updates for collaborators.
alter publication supabase_realtime add table public.canvas_frames;
