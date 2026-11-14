-- Teams own prototypes, device templates and (next) design systems.
-- Everyone has a personal team; people can create more and invite others by email.
-- Builds still count against each person's own plan.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  personal boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null check (email = lower(email)),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, email)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.team_devices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('desktop', 'tablet', 'phone')),
  width int not null check (width between 200 and 7680),
  height int not null check (height between 200 and 7680),
  frame text not null default 'bezel' check (frame in ('bezel', 'none')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index team_devices_team_idx on public.team_devices (team_id);

alter table public.projects add column team_id uuid references public.teams(id) on delete set null;
create index projects_team_idx on public.projects (team_id);

-- The caller's role on a team: admin, member, or null.
create or replace function public.team_role(t uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.team_members m
  where m.team_id = t
    and (m.user_id = auth.uid() or (m.user_id is null and m.email = lower(coalesce(auth.jwt() ->> 'email', ''))))
  order by case m.role when 'admin' then 0 else 1 end
  limit 1
$$;

-- Project roles now include the project's team: everyone on it can open and build.
create or replace function public.project_role(p uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.projects pr where pr.id = p and pr.owner_id = auth.uid()) then 'owner'
    when exists (
      select 1 from public.projects pr
      where pr.id = p and pr.team_id is not null and public.team_role(pr.team_id) is not null
    ) then 'editor'
    else coalesce(
      (select m.role from public.project_members m
        where m.project_id = p
          and (m.user_id = auth.uid() or m.email = lower(coalesce(auth.jwt() ->> 'email', '')))
        limit 1),
      (select 'public' from public.projects pr
        where pr.id = p and pr.published and pr.access_mode = 'public')
    )
  end
$$;

-- A personal team for a user, created once.
create or replace function public.ensure_personal_team(p_user uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_team uuid;
begin
  select t.id into v_team from public.teams t
    join public.team_members m on m.team_id = t.id
    where t.personal and m.user_id = p_user limit 1;
  if v_team is null then
    insert into public.teams (name, personal, created_by) values ('Personal', true, p_user) returning id into v_team;
    insert into public.team_members (team_id, email, user_id, role) values (v_team, lower(p_email), p_user, 'admin');
  end if;
  return v_team;
end
$$;
revoke execute on function public.ensure_personal_team(uuid, text) from public, anon, authenticated;

-- New users: profile, personal team, and any pending project or team invites.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email))
    on conflict (id) do nothing;
  update public.project_members set user_id = new.id
    where email = lower(new.email) and user_id is null;
  update public.team_members set user_id = new.id
    where email = lower(new.email) and user_id is null;
  perform public.ensure_personal_team(new.id, new.email);
  return new;
end
$$;

-- Existing users get their personal team, and their prototypes move into it.
do $$
declare r record; v_team uuid;
begin
  for r in select id, email from public.profiles loop
    v_team := public.ensure_personal_team(r.id, r.email);
    update public.projects set team_id = v_team where owner_id = r.id and team_id is null;
  end loop;
end $$;

-- Create a team; the caller becomes its admin.
create or replace function public.create_team(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_team uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.teams (name, created_by) values (btrim(p_name), auth.uid()) returning id into v_team;
  insert into public.team_members (team_id, email, user_id, role)
    values (v_team, lower(coalesce(auth.jwt() ->> 'email', '')), auth.uid(), 'admin');
  return v_team;
end
$$;
revoke execute on function public.create_team(text) from public, anon;
grant execute on function public.create_team(text) to authenticated;

-- Pending invites become memberships when the invited person shows up signed in.
create or replace function public.claim_team_invites()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.team_members set user_id = auth.uid()
  where user_id is null and email = lower(coalesce(auth.jwt() ->> 'email', '')) and auth.uid() is not null
$$;
revoke execute on function public.claim_team_invites() from public, anon;
grant execute on function public.claim_team_invites() to authenticated;

-- A team always keeps at least one admin, and personal teams keep their one member.
create or replace function public.guard_team_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_team uuid := old.team_id;
begin
  if (tg_op = 'DELETE' or new.role <> 'admin') and old.role = 'admin' then
    if not exists (
      select 1 from public.team_members m
      where m.team_id = v_team and m.role = 'admin' and m.email <> old.email
    ) and exists (select 1 from public.teams t where t.id = v_team) then
      raise exception 'A team needs at least one admin. Make someone else an admin first.';
    end if;
  end if;
  return coalesce(new, old);
end
$$;
create trigger team_members_keep_admin
  before update or delete on public.team_members
  for each row execute function public.guard_team_admins();
revoke execute on function public.guard_team_admins() from public, anon, authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_devices enable row level security;

create policy "teams: members read" on public.teams
  for select to authenticated using (public.team_role(id) is not null);
create policy "teams: admins rename" on public.teams
  for update to authenticated using (public.team_role(id) = 'admin') with check (public.team_role(id) = 'admin');
create policy "teams: admins delete shared teams" on public.teams
  for delete to authenticated using (public.team_role(id) = 'admin' and not personal);

create policy "team members: teammates read" on public.team_members
  for select to authenticated using (public.team_role(team_id) is not null);
create policy "team members: admins invite" on public.team_members
  for insert to authenticated with check (
    public.team_role(team_id) = 'admin'
    and not exists (select 1 from public.teams t where t.id = team_id and t.personal)
  );
create policy "team members: admins change roles" on public.team_members
  for update to authenticated using (public.team_role(team_id) = 'admin');
create policy "team members: admins remove, anyone leaves" on public.team_members
  for delete to authenticated using (
    public.team_role(team_id) = 'admin'
    or user_id = auth.uid()
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "team devices: members read" on public.team_devices
  for select to authenticated using (public.team_role(team_id) is not null);
create policy "team devices: admins add" on public.team_devices
  for insert to authenticated with check (public.team_role(team_id) = 'admin');
create policy "team devices: admins change" on public.team_devices
  for update to authenticated using (public.team_role(team_id) = 'admin');
create policy "team devices: admins remove" on public.team_devices
  for delete to authenticated using (public.team_role(team_id) = 'admin');

-- New prototypes go into a team the creator belongs to.
drop policy "projects: create own" on public.projects;
create policy "projects: create own" on public.projects
  for insert to authenticated with check (
    owner_id = auth.uid() and (team_id is null or public.team_role(team_id) is not null)
  );
-- Owners can move a prototype between their own teams.
drop policy "projects: owner updates" on public.projects;
create policy "projects: owner updates" on public.projects
  for update to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (team_id is null or public.team_role(team_id) is not null));
