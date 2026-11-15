-- Phase 2 of the engineering review: correctness and abuse limits.

-- ---- Publish-on-push in commit order (R2) ----------------------------------------------

-- A push build publishes its version only if the version that's live didn't come from a
-- push queued after it. Builds can finish out of order; without this, whichever finished
-- last went live, even an older commit. Returns whether it published.
create or replace function public.publish_push_build(p_build uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.builds;
  v_published int;
begin
  select * into b from public.builds where id = p_build;
  if b.id is null or b.version_id is null then return false; end if;
  update public.projects p
    set live_version_id = b.version_id, published = true
    where p.id = b.project_id
      and not exists (
        select 1 from public.builds newer
        where newer.project_id = b.project_id
          and newer.version_id = p.live_version_id
          and newer.queued_at > b.queued_at
      );
  get diagnostics v_published = row_count;
  return v_published > 0;
end
$$;
revoke execute on function public.publish_push_build(uuid) from public, anon, authenticated;

-- ---- Spend cap counts builds in flight (R3) --------------------------------------------

-- The cap used to count only finished builds, so starting several at once could each pass the
-- check and overshoot it together. Builds still running now count at an estimate of $0.50
-- billed each (a typical build), and team prototypes take one lock per team, so teammates
-- can't pass the team's check at the same moment.
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

-- ---- Email digest: small batches, failed sends retried (R5, S5, X3) --------------------

-- Each notification gets up to three tries at being emailed.
alter table public.notifications add column email_attempts int not null default 0;

-- Hands out up to p_limit people's due notifications at once (was 200, sent one by one in a
-- 60-second function). Each item now carries its id, so a failed send can be put back.
drop function if exists public.claim_notification_digest();
create function public.claim_notification_digest(p_limit int default 25)
returns table (user_id uuid, email text, name text, prefs jsonb, items jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select p.id
    from public.profiles p
    where (p.notified_at is null or p.notified_at < now() - interval '15 minutes')
      and exists (
        select 1 from public.notifications n
        where n.user_id = p.id and n.emailed_at is null and n.created_at < now() - interval '2 minutes'
      )
    for update of p skip locked
    limit greatest(1, least(p_limit, 200))
  ),
  stamped as (
    update public.profiles p set notified_at = now() from due where p.id = due.id returning p.id
  ),
  taken as (
    update public.notifications n set emailed_at = now()
    from stamped s
    where n.user_id = s.id and n.emailed_at is null and n.created_at < now() - interval '2 minutes'
    returning n.*
  )
  select pr.id, pr.email, pr.display_name, pr.notify_email,
    jsonb_agg(jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'team_id', t.team_id, 'project_id', t.project_id, 'project', pj.name,
      'version_id', t.version_id, 'version', v.number, 'actor', t.actor_name, 'body', t.body,
      'created_at', t.created_at
    ) order by t.created_at)
  from taken t
  join public.profiles pr on pr.id = t.user_id
  left join public.projects pj on pj.id = t.project_id
  left join public.versions v on v.id = t.version_id
  group by pr.id, pr.email, pr.display_name, pr.notify_email;
end $$;
revoke execute on function public.claim_notification_digest(int) from public, anon, authenticated;

-- Puts back notifications whose email failed to send, so the next run tries again (up to
-- three tries in all), and lets that person be emailed again straight away.
create or replace function public.release_notification_digest(p_user uuid, p_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  update public.notifications
    set emailed_at = null, email_attempts = email_attempts + 1
    where user_id = p_user and id = any(p_ids) and email_attempts < 2;
  get diagnostics v_count = row_count;
  update public.profiles set notified_at = null where id = p_user;
  return v_count;
end $$;
revoke execute on function public.release_notification_digest(uuid, uuid[]) from public, anon, authenticated;

-- The digest now runs from Vercel Cron, which sends the cron secret; the endpoint refuses
-- callers without it. Stop the old unauthenticated database schedule.
select cron.unschedule('realframe-notification-digest')
  where exists (select 1 from cron.job where jobname = 'realframe-notification-digest');

-- ---- Rate limits (X1, X2) --------------------------------------------------------------

-- Fixed-window counters, keyed by what's being limited (for example a password page and the
-- caller's IP). Service role only; the sweeper deletes old windows.
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);
alter table public.rate_limits enable row level security;

-- Counts one hit on p_key and says whether it's allowed: at most p_limit hits per window of
-- p_window_seconds.
create or replace function public.hit_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
    values (p_key, now(), 1)
    on conflict (key) do update set
      window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                          then now() else r.window_start end,
      hits = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                  then 1 else r.hits + 1 end
    returning hits into v_hits;
  return v_hits <= p_limit;
end
$$;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

-- ---- Error capture (T5) ----------------------------------------------------------------

-- Server errors (from instrumentation's onRequestError) and errors people hit in the browser
-- (reported by the error pages). Service role only; the sweeper keeps 30 days.
create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('server', 'client')),
  message text not null,
  digest text,
  path text,
  method text,
  route text,
  route_type text,
  user_id uuid,
  stack text
);
create index app_errors_recent on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;
