-- Phase 3 of the engineering review: cost and scale, and the remaining edge cases.

-- ---- Month boundaries are UTC (E3) -----------------------------------------------------

-- Several functions take date_trunc('month', now()), which follows the session's time zone.
-- Pin the database's default to UTC so those boundaries can't move if a setting changes.
do $$ begin
  execute format('alter database %I set timezone to %L', current_database(), 'UTC');
exception when insufficient_privilege then
  raise notice 'Could not set the database time zone; it stays %', current_setting('timezone');
end $$;

-- ---- Seats are prorated across a billing period (E1) ----------------------------------

-- Every change to a team's seat count, so included usage can follow the seats a team actually
-- had during a period, not just the count on invoice day.
create table public.team_seat_history (
  team_id uuid not null references public.teams on delete cascade,
  seats int not null,
  changed_at timestamptz not null default now()
);
create index team_seat_history_team on public.team_seat_history (team_id, changed_at);
alter table public.team_seat_history enable row level security;

-- Today's counts, as if they'd always been so: history starts now.
insert into public.team_seat_history (team_id, seats, changed_at)
  select id, coalesce(seats, 1), '-infinity'::timestamptz from public.teams;

create or replace function public.record_team_seats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.seats is distinct from old.seats then
    insert into public.team_seat_history (team_id, seats) values (new.id, coalesce(new.seats, 1));
  end if;
  return new;
end
$$;
revoke execute on function public.record_team_seats() from public, anon, authenticated;
create trigger teams_record_seats
  after insert or update of seats on public.teams
  for each row execute function public.record_team_seats();

-- The team's seat count averaged over [p_from, p_to), weighted by time.
create or replace function public.team_average_seats(p_team uuid, p_from timestamptz, p_to timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with h as (
    select seats, changed_at,
      lead(changed_at) over (order by changed_at) as next_at
    from public.team_seat_history where team_id = p_team
  ),
  spans as (
    select seats,
      greatest(changed_at, p_from) as s,
      least(coalesce(next_at, 'infinity'::timestamptz), p_to) as e
    from h
  )
  select coalesce(
    (select sum(seats * extract(epoch from (e - s))) / nullif(sum(extract(epoch from (e - s))), 0)
       from spans where e > s),
    (select seats::numeric from public.teams where id = p_team),
    1
  )
$$;
revoke execute on function public.team_average_seats(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ---- Archived prototypes don't build (E2) ----------------------------------------------

-- Same as 0031, plus: an archived prototype refuses new builds until it's restored. (GitHub
-- pushes skip archived prototypes in the webhook.)
create or replace function public.claim_generation(p_project uuid, p_kind text default 'build')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project);
  q record;
  a record;
  v_id uuid;
  v_busy uuid;
  v_name text;
  v_inflight int;
  c_estimate constant bigint := 500000;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v_role is null or v_role not in ('owner', 'editor') then raise exception 'forbidden'; end if;
  if p_kind not in ('build', 'variant', 'fix', 'ai_copy', 'export', 'voice') then raise exception 'bad_kind'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if exists (select 1 from public.projects where id = p_project and archived_at is not null) then
    raise exception 'project_archived';
  end if;

  if p_kind in ('build', 'fix', 'ai_copy') then
    perform pg_advisory_xact_lock(hashtextextended('build-slot:' || p_project::text, 0));
    select g.user_id into v_busy
      from public.generations g
      where g.project_id = p_project
        and g.status = 'started'
        and g.kind in ('build', 'fix', 'ai_copy')
        and (
          g.created_at > now() - interval '15 minutes'
          or exists (
            select 1 from public.build_runs b
            where b.generation_id = g.id and b.status = 'running'
              and b.updated_at > now() - interval '15 minutes'
          )
        )
      order by g.created_at desc
      limit 1;
    if v_busy is not null then
      select coalesce(nullif(p.display_name, ''), p.email, 'someone') into v_name
        from public.profiles p where p.id = v_busy;
      raise exception 'build_in_progress: %', case when v_busy = auth.uid() then 'you' else coalesce(v_name, 'someone') end;
    end if;
  end if;

  select * into q from public.build_quota(p_project);
  if q.team_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('team:' || q.team_id::text, 0));
  end if;
  if q.used >= q.build_limit then
    if q.plan in ('pro', 'team') then raise exception 'daily_limit_reached'; end if;
    raise exception 'free_limit_reached';
  end if;
  -- The cap is checked when work starts, never part-way through a planned build.
  if q.plan in ('pro', 'team') then
    select * into a from public.account_usage(auth.uid(), q.team_id);
    if a.spend_cap_micros is not null then
      select count(*) into v_inflight from public.generations g
        where g.status = 'started'
          and g.created_at > now() - interval '15 minutes'
          and (
            (q.team_id is not null and g.team_id = q.team_id)
            or (q.team_id is null and g.user_id = auth.uid() and g.team_id is null)
          );
      if a.usage_micros + v_inflight * c_estimate >= a.spend_cap_micros then
        raise exception 'spend_cap_reached';
      end if;
    end if;
  end if;
  insert into public.generations (user_id, project_id, team_id, kind)
    values (auth.uid(), p_project, q.team_id, p_kind)
    returning id into v_id;
  return v_id;
end
$$;
revoke execute on function public.claim_generation(uuid, text) from public, anon;
grant execute on function public.claim_generation(uuid, text) to authenticated;

-- ---- Storage retention (S6) ------------------------------------------------------------

-- When an old imported or repo-built version's files were removed.
alter table public.versions add column bundle_pruned_at timestamptz;

-- Files in the bundles bucket that can go, up to p_limit at a time:
-- * orphans: files under <project>/<bundle id>/ with no version, a day or more old (uploads
--   from builds that failed or imports that were abandoned);
-- * old: files of a bundle version over 90 days old that isn't live, isn't under review, and
--   isn't among its prototype's 10 newest bundle versions.
-- Source zips under <project>/uploads/ are left alone.
create or replace function public.bundle_files_to_prune(p_limit int default 1000)
returns table (name text, bundle_id uuid, reason text)
language sql
stable
security definer
set search_path = ''
as $$
  with objs as (
    select o.name, split_part(o.name, '/', 2) as seg, o.created_at
    from storage.objects o
    where o.bucket_id = 'bundles'
      and split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  ranked as (
    select v.id, v.project_id, v.bundle_id, v.created_at,
      row_number() over (partition by v.project_id order by v.number desc) as recent
    from public.versions v
    where v.kind = 'bundle'
  ),
  expired as (
    select r.bundle_id from ranked r
    where r.created_at < now() - interval '90 days'
      and r.recent > 10
      and not exists (select 1 from public.projects p where p.live_version_id = r.id)
      and not exists (
        select 1 from public.review_rounds rr where rr.version_id = r.id and rr.closed_at is null
      )
  )
  (
    select o.name, o.seg::uuid, 'orphan'
    from objs o
    where o.created_at < now() - interval '1 day'
      and not exists (select 1 from public.versions v where v.bundle_id = o.seg::uuid)
    union all
    select o.name, o.seg::uuid, 'old'
    from objs o
    join expired e on e.bundle_id = o.seg::uuid
  )
  limit greatest(1, least(p_limit, 5000))
$$;
revoke execute on function public.bundle_files_to_prune(int) from public, anon, authenticated;

-- ---- Stop a planned build mid-step (P4) ------------------------------------------------

-- Set when the person presses Stop while a step is building; the running step checks it every
-- couple of seconds, stops its AI call, and settles the run without charging for that step.
alter table public.build_runs add column cancel_requested_at timestamptz;
