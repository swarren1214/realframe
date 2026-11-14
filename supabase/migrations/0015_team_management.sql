-- Team management: invites that are accepted or declined, admins acting as owners on team
-- prototypes, ownership transfer, a GitHub connection shared with a team, and Team Pro billing.

-- ---- Invites ----------------------------------------------------------------------------
-- A membership is 'pending' until the invited person accepts it; only active members get access.
alter table public.team_members
  add column status text not null default 'active' check (status in ('pending', 'active')),
  add column responded_at timestamptz;
alter table public.team_members alter column status set default 'pending';

create or replace function public.team_role(t uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.team_members m
  where m.team_id = t and m.status = 'active' and m.user_id = auth.uid()
  order by case m.role when 'admin' then 0 else 1 end
  limit 1
$$;

-- Personal and newly created teams start their creator as an active admin.
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
    insert into public.team_members (team_id, email, user_id, role, status) values (v_team, lower(p_email), p_user, 'admin', 'active');
  end if;
  return v_team;
end
$$;

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
  insert into public.team_members (team_id, email, user_id, role, status)
    values (v_team, lower(coalesce(auth.jwt() ->> 'email', '')), auth.uid(), 'admin', 'active');
  return v_team;
end
$$;

-- Invites now wait for an answer instead of applying on sign-in.
drop function if exists public.claim_team_invites();

-- Invites waiting for the signed-in person.
create or replace function public.my_team_invites()
returns table (team_id uuid, team_name text, role text, invited_by text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.team_id, t.name, m.role, coalesce(p.display_name, p.email), m.created_at
  from public.team_members m
  join public.teams t on t.id = m.team_id
  left join public.profiles p on p.id = m.invited_by
  where m.status = 'pending' and m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  order by m.created_at desc
$$;
revoke execute on function public.my_team_invites() from public, anon;
grant execute on function public.my_team_invites() to authenticated;

create or replace function public.respond_team_invite(p_team uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.team_members where team_id = p_team and email = v_email and status = 'pending') then
    raise exception 'That invite is no longer open.';
  end if;
  if p_accept then
    update public.team_members set status = 'active', user_id = auth.uid(), responded_at = now()
      where team_id = p_team and email = v_email;
  else
    delete from public.team_members where team_id = p_team and email = v_email and status = 'pending';
  end if;
end
$$;
revoke execute on function public.respond_team_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_team_invite(uuid, boolean) to authenticated;

-- New users: profile, personal team, and links for pending project invites. Team invites wait.
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
  perform public.ensure_personal_team(new.id, new.email);
  return new;
end
$$;

-- The admin guard counts active admins only.
create or replace function public.guard_team_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_team uuid := old.team_id;
begin
  if old.status = 'active' and old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active') then
    if not exists (
      select 1 from public.team_members m
      where m.team_id = v_team and m.role = 'admin' and m.status = 'active' and m.email <> old.email
    ) and exists (select 1 from public.teams t where t.id = v_team) then
      raise exception 'A team needs at least one admin. Make someone else an admin first.';
    end if;
  end if;
  return coalesce(new, old);
end
$$;

-- Invitees can see their own pending row (to decline it).
drop policy "team members: teammates read" on public.team_members;
create policy "team members: teammates read" on public.team_members
  for select to authenticated using (
    public.team_role(team_id) is not null or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ---- Admins act as owners on team prototypes -------------------------------------------
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
      where pr.id = p and pr.team_id is not null and public.team_role(pr.team_id) = 'admin'
    ) then 'owner'
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

drop policy "projects: owner updates" on public.projects;
create policy "projects: owner updates" on public.projects
  for update to authenticated using (public.project_role(id) = 'owner')
  with check (team_id is null or public.team_role(team_id) is not null);
drop policy "projects: owner deletes" on public.projects;
create policy "projects: owner deletes" on public.projects
  for delete to authenticated using (public.project_role(id) = 'owner');

-- ---- Transfer ownership ----------------------------------------------------------------
-- The new owner must be an active member of the prototype's team.
create or replace function public.transfer_project(p_project uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_team uuid;
begin
  if public.project_role(p_project) is distinct from 'owner' then raise exception 'Only the owner or a team admin can transfer this prototype.'; end if;
  select team_id into v_team from public.projects where id = p_project;
  if v_team is null or not exists (
    select 1 from public.team_members where team_id = v_team and user_id = p_user and status = 'active'
  ) then
    raise exception 'The new owner has to be on the prototype''s team.';
  end if;
  update public.projects set owner_id = p_user, updated_at = now() where id = p_project;
end
$$;
revoke execute on function public.transfer_project(uuid, uuid) from public, anon;
grant execute on function public.transfer_project(uuid, uuid) to authenticated;

-- Names, photos and emails of a team's active members (for pickers).
drop function if exists public.team_profiles(uuid);
create or replace function public.team_profiles(t uuid)
returns table (user_id uuid, display_name text, avatar_url text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_url, m.email
  from public.team_members m join public.profiles p on p.id = m.user_id
  where m.team_id = t and m.status = 'active' and public.team_role(t) is not null
$$;
revoke execute on function public.team_profiles(uuid) from public, anon;
grant execute on function public.team_profiles(uuid) to authenticated;

-- ---- A GitHub connection shared with a team -------------------------------------------
create table public.team_github_installations (
  team_id uuid not null references public.teams on delete cascade,
  installation_id bigint not null references public.github_installations on delete cascade,
  shared_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, installation_id)
);
alter table public.team_github_installations enable row level security;
create policy "team github: members read" on public.team_github_installations
  for select to authenticated using (public.team_role(team_id) is not null);

-- Installations someone connected themselves, or that a team they're on shares.
drop policy "see installations you can use" on public.github_installations;
create policy "see installations you can use" on public.github_installations
  for select to authenticated using (
    exists (select 1 from public.github_installation_users u where u.installation_id = id and u.user_id = auth.uid())
    or exists (
      select 1 from public.team_github_installations s
      where s.installation_id = id and public.team_role(s.team_id) is not null
    )
  );

-- ---- Team Pro billing ------------------------------------------------------------------
alter table public.teams
  add column plan text not null default 'free' check (plan in ('free', 'team')),
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text,
  add column subscription_status text,
  add column seats int not null default 0,
  add column current_period_start timestamptz,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false;

-- Builds billed to a team instead of the person who ran them.
alter table public.generations add column team_id uuid references public.teams on delete set null;
create index generations_team_idx on public.generations (team_id, created_at);

-- The plan a build in this prototype runs under: the team's Team Pro if it has one and the
-- caller is on it, otherwise the caller's own plan.
create or replace function public.build_quota(p_project uuid)
returns table (
  plan text,
  build_limit int,
  used int,
  remaining int,
  period_start timestamptz,
  period_end timestamptz,
  usage_micros bigint,
  included_micros bigint,
  team_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_team record; v_s record; v_used int; v_usage bigint;
begin
  select t.* into v_team from public.projects pr join public.teams t on t.id = pr.team_id
    where pr.id = p_project and t.plan = 'team' and public.team_role(t.id) is not null;
  if v_team.id is null then
    return query select q.*, null::uuid from public.generation_quota() q;
    return;
  end if;
  select * into v_s from public.plan_settings();
  select count(*)::int into v_used from public.generations g
    where g.user_id = auth.uid() and g.team_id = v_team.id and g.created_at >= now() - interval '24 hours';
  select coalesce(sum(g.billed_micros), 0)::bigint into v_usage from public.generations g
    where g.team_id = v_team.id
      and g.created_at >= coalesce(v_team.current_period_start, date_trunc('month', now()))
      and g.created_at < coalesce(v_team.current_period_end, date_trunc('month', now()) + interval '1 month');
  return query select
    'team'::text,
    v_s.pro_daily_builds,
    v_used,
    greatest(v_s.pro_daily_builds - v_used, 0),
    coalesce(v_team.current_period_start, date_trunc('month', now())),
    coalesce(v_team.current_period_end, date_trunc('month', now()) + interval '1 month'),
    v_usage,
    v_s.pro_included_micros * greatest(v_team.seats, 1),
    v_team.id;
end
$$;
revoke execute on function public.build_quota(uuid) from public, anon;
grant execute on function public.build_quota(uuid) to authenticated;

-- Claiming a build: team builds count against Team Pro's per-person daily limit.
create or replace function public.claim_generation(p_project uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project);
  q record;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v_role is null or v_role not in ('owner', 'editor') then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into q from public.build_quota(p_project);
  if q.used >= q.build_limit then
    if q.plan in ('pro', 'team') then raise exception 'daily_limit_reached'; end if;
    raise exception 'free_limit_reached';
  end if;
  insert into public.generations (user_id, project_id, team_id) values (auth.uid(), p_project, q.team_id) returning id into v_id;
  return v_id;
end
$$;

-- Personal quotas no longer count builds a team paid for.
create or replace function public.generation_quota()
returns table (
  plan text,
  build_limit int,
  used int,
  remaining int,
  period_start timestamptz,
  period_end timestamptz,
  usage_micros bigint,
  included_micros bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select * from public.plan_settings()),
  p as (
    select coalesce(pr.plan, 'free') as plan, pr.build_limit_override, pr.current_period_start, pr.current_period_end
    from (select auth.uid() as id) me left join public.profiles pr on pr.id = me.id
  ),
  w as (
    select
      p.plan,
      case when p.plan = 'pro' then coalesce(p.build_limit_override, s.pro_daily_builds)
           else coalesce(p.build_limit_override, s.free_monthly_builds) end as lim,
      case when p.plan = 'pro' then now() - interval '24 hours'
           else date_trunc('month', now() at time zone 'utc') at time zone 'utc' end as count_from,
      case when p.plan = 'pro' then coalesce(p.current_period_start, date_trunc('month', now() at time zone 'utc') at time zone 'utc')
           else date_trunc('month', now() at time zone 'utc') at time zone 'utc' end as ps,
      case when p.plan = 'pro' then coalesce(p.current_period_end, (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc')
           else (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc' end as pe,
      case when p.plan = 'pro' then s.pro_included_micros else 0 end as inc
    from p, s
  )
  select
    w.plan,
    w.lim,
    (select count(*)::int from public.generations g where g.user_id = auth.uid() and g.team_id is null and g.created_at >= w.count_from),
    greatest(w.lim - (select count(*)::int from public.generations g where g.user_id = auth.uid() and g.team_id is null and g.created_at >= w.count_from), 0),
    w.ps,
    w.pe,
    (select coalesce(sum(g.billed_micros), 0)::bigint from public.generations g
      where g.user_id = auth.uid() and g.team_id is null and g.created_at >= w.ps and g.created_at < w.pe),
    w.inc
  from w
$$;
