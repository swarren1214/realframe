-- Free reviewer seats and fair usage.
--
-- 1. Teams get a third role, 'reviewer'. Reviewers can open every team prototype, comment on
--    it and approve it, but can't build, edit, publish or create prototypes. They are never
--    counted as Team Pro seats.
-- 2. A failed build is never billed, whatever cost the caller reports.

-- ---- Reviewer role -----------------------------------------------------------------------
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members
  add constraint team_members_role_check check (role in ('admin', 'member', 'reviewer'));

-- Team roles that can build: admins and members.
create or replace function public.team_builder(t uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.team_role(t) in ('admin', 'member'), false)
$$;
revoke execute on function public.team_builder(uuid) from public, anon;
grant execute on function public.team_builder(uuid) to authenticated;

-- team_role() keeps returning the best role: admin, then member, then reviewer.
create or replace function public.team_role(t uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.team_members m
  where m.team_id = t and m.status = 'active' and m.user_id = auth.uid()
  order by case m.role when 'admin' then 0 when 'member' then 1 else 2 end
  limit 1
$$;

-- Team reviewers get 'commenter' on the team's prototypes. A project-level invite with more
-- access (editor) still wins, so someone can review the team and build one prototype.
create or replace function public.project_role(p uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with pr as (select * from public.projects where id = p),
  tr as (select public.team_role(pr.team_id) as r from pr where pr.team_id is not null),
  mr as (
    select m.role from public.project_members m
    where m.project_id = p
      and (m.user_id = auth.uid() or m.email = lower(coalesce(auth.jwt() ->> 'email', '')))
    order by case m.role when 'editor' then 0 when 'commenter' then 1 else 2 end
    limit 1
  )
  select case
    when exists (select 1 from pr where pr.owner_id = auth.uid()) then 'owner'
    when (select r from tr) = 'admin' then 'owner'
    when (select r from tr) = 'member' then 'editor'
    when (select role from mr) = 'editor' then 'editor'
    when (select r from tr) = 'reviewer' then 'commenter'
    else coalesce(
      (select role from mr),
      (select 'public' from pr where pr.published and pr.access_mode = 'public')
    )
  end
$$;

-- Only builders can put prototypes in a team or move them there.
drop policy "projects: create own" on public.projects;
create policy "projects: create own" on public.projects
  for insert to authenticated with check (
    owner_id = auth.uid() and (team_id is null or public.team_builder(team_id))
  );
drop policy "projects: owner updates" on public.projects;
create policy "projects: owner updates" on public.projects
  for update to authenticated using (public.project_role(id) = 'owner')
  with check (team_id is null or public.team_builder(team_id));

-- Ownership can only move to a builder on the prototype's team.
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
    select 1 from public.team_members
    where team_id = v_team and user_id = p_user and status = 'active' and role in ('admin', 'member')
  ) then
    raise exception 'The new owner has to be a builder on the prototype''s team.';
  end if;
  update public.projects set owner_id = p_user, updated_at = now() where id = p_project;
end
$$;

-- Paid seats: active members who can build. Reviewers are free.
create or replace function public.team_seat_count(t uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(count(*)::int, 1) from public.team_members m
  where m.team_id = t and m.status = 'active' and m.role in ('admin', 'member')
$$;
revoke execute on function public.team_seat_count(uuid) from public, anon;
grant execute on function public.team_seat_count(uuid) to authenticated, service_role;

-- ---- Failed builds are free -------------------------------------------------------------
create or replace function public.finish_generation(
  p_id uuid, p_status text, p_input_tokens int, p_output_tokens int, p_cost_micros bigint
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.generations g
    set status = p_status,
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        cost_micros = greatest(coalesce(p_cost_micros, 0), 0),
        billed_micros = case
          when p_status = 'failed' then 0
          else ceil(greatest(coalesce(p_cost_micros, 0), 0) * (select s.usage_markup from public.plan_settings() s))::bigint
        end
    where g.id = p_id and g.status = 'started' and p_status in ('succeeded', 'failed')
$$;
revoke execute on function public.finish_generation(uuid, text, int, int, bigint) from public, anon, authenticated;
grant execute on function public.finish_generation(uuid, text, int, int, bigint) to service_role;
