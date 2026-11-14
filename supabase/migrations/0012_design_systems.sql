-- Design systems belong to a team. Importing one reads its source (GitHub, npm, Storybook or
-- uploaded files) and extracts tokens, components and rules that every build follows.

create table public.design_systems (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  source_kind text not null check (source_kind in ('github', 'npm', 'storybook', 'upload')),
  source jsonb not null default '{}'::jsonb,
  status text not null default 'importing' check (status in ('importing', 'ready', 'failed')),
  progress text,
  error text,
  -- 'components': prototypes load the real components. 'styles': tokens and rules only.
  kind text check (kind in ('components', 'styles')),
  summary text,
  tokens jsonb not null default '{}'::jsonb,
  components jsonb not null default '[]'::jsonb,
  -- How a prototype loads real components (import map, stylesheet).
  runtime jsonb,
  sync_on_push boolean not null default false,
  synced_sha text,
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  synced_at timestamptz
);
create index design_systems_team_idx on public.design_systems (team_id);
create unique index design_systems_one_default on public.design_systems (team_id) where is_default;

create table public.design_system_rules (
  id uuid primary key default gen_random_uuid(),
  design_system_id uuid not null references public.design_systems(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  origin text not null default 'admin' check (origin in ('docs', 'admin', 'suggested')),
  status text not null default 'active' check (status in ('active', 'pending')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);
create index design_system_rules_ds_idx on public.design_system_rules (design_system_id);

alter table public.projects add column design_system_id uuid references public.design_systems(id) on delete set null;
alter table public.versions add column design_system_id uuid references public.design_systems(id) on delete set null;

create or replace function public.design_system_team_role(ds uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.team_role(d.team_id) from public.design_systems d where d.id = ds
$$;

-- Only one default per team: setting one clears the others.
create or replace function public.set_default_design_system(p_team uuid, p_ds uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.team_role(p_team) is distinct from 'admin' then raise exception 'Only admins can set the team default.'; end if;
  update public.design_systems set is_default = false where team_id = p_team and is_default and id is distinct from p_ds;
  if p_ds is not null then
    update public.design_systems set is_default = true where id = p_ds and team_id = p_team;
  end if;
end
$$;
revoke execute on function public.set_default_design_system(uuid, uuid) from public, anon;
grant execute on function public.set_default_design_system(uuid, uuid) to authenticated;

alter table public.design_systems enable row level security;
alter table public.design_system_rules enable row level security;

create policy "design systems: team reads" on public.design_systems
  for select to authenticated using (public.team_role(team_id) is not null);
create policy "design systems: admins add" on public.design_systems
  for insert to authenticated with check (public.team_role(team_id) = 'admin');
create policy "design systems: admins change" on public.design_systems
  for update to authenticated using (public.team_role(team_id) = 'admin');
create policy "design systems: admins remove" on public.design_systems
  for delete to authenticated using (public.team_role(team_id) = 'admin');

create policy "rules: team reads" on public.design_system_rules
  for select to authenticated using (public.design_system_team_role(design_system_id) is not null);
-- Admins add rules; members can only suggest them.
create policy "rules: admins add, members suggest" on public.design_system_rules
  for insert to authenticated with check (
    public.design_system_team_role(design_system_id) = 'admin'
    or (
      public.design_system_team_role(design_system_id) = 'member'
      and origin = 'suggested' and status = 'pending' and created_by = auth.uid()
    )
  );
create policy "rules: admins change" on public.design_system_rules
  for update to authenticated using (public.design_system_team_role(design_system_id) = 'admin');
create policy "rules: admins remove" on public.design_system_rules
  for delete to authenticated using (public.design_system_team_role(design_system_id) = 'admin');

-- Uploaded design system files (tokens, CSS, style guides, component zips). Private.
insert into storage.buckets (id, name, public, file_size_limit) values ('design-systems', 'design-systems', false, 26214400)
  on conflict (id) do nothing;
create policy "design system uploads: team admins" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'design-systems'
    and public.team_role(((storage.foldername(name))[1])::uuid) = 'admin'
  );
