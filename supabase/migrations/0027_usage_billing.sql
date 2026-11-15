-- Usage & billing: what kind of work each build was, how long it took, a monthly spend cap,
-- usage alerts in the Inbox, and the data behind the Usage tab.
--
-- Spend cap and alerts are measured against the same period and billed amounts the quota
-- functions use (billed_micros = cost + markup, failed builds $0), so what the Usage tab
-- shows is what Stripe charges.

-- ---- What each build was --------------------------------------------------------------
alter table public.generations
  add column kind text not null default 'build'
    check (kind in ('build', 'variant', 'fix', 'ai_copy', 'export', 'voice')),
  add column duration_ms int;

-- Best-effort backfill: variants are the builds that produced a variant version.
update public.generations g set kind = 'variant'
  from public.versions v
  where g.version_id = v.id and v.source = 'variant';
update public.generations g
  set duration_ms = greatest(extract(epoch from (r.updated_at - r.created_at)) * 1000, 0)::int
  from public.build_runs r
  where r.generation_id = g.id and r.status in ('succeeded', 'failed') and g.duration_ms is null;

create index generations_team_period_idx on public.generations (team_id, created_at desc) where team_id is not null;

-- ---- Spend controls -------------------------------------------------------------------
-- spend_cap_micros: refuse new builds once this period's billed usage reaches it (null = no cap).
-- alert_thresholds: percentages of the included usage that post an Inbox alert.
-- alerts_sent: which alerts went out this period, so each goes out once.
alter table public.profiles
  add column spend_cap_micros bigint check (spend_cap_micros is null or spend_cap_micros >= 0),
  add column alert_thresholds int[] not null default '{50,80,100}'
    check (alert_thresholds <@ '{25,50,75,80,90,100,150,200}'::int[]),
  add column alerts_sent jsonb not null default '{}'::jsonb;
alter table public.teams
  add column spend_cap_micros bigint check (spend_cap_micros is null or spend_cap_micros >= 0),
  add column alert_thresholds int[] not null default '{50,80,100}'
    check (alert_thresholds <@ '{25,50,75,80,90,100,150,200}'::int[]),
  add column alerts_sent jsonb not null default '{}'::jsonb;

-- People set their own controls; team controls are changed by admins through the server.
grant update (spend_cap_micros, alert_thresholds) on public.profiles to authenticated;

-- ---- The billing account behind a build ---------------------------------------------------
-- The period, billed usage and controls for a person's own billing (p_team null) or a Team Pro
-- team. Mirrors generation_quota() and build_quota(), but for any account, not the caller's.
create or replace function public.account_usage(p_user uuid, p_team uuid)
returns table (
  plan text,
  period_start timestamptz,
  period_end timestamptz,
  usage_micros bigint,
  included_micros bigint,
  spend_cap_micros bigint,
  alert_thresholds int[],
  alerts_sent jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record; t record; p record;
  v_ps timestamptz; v_pe timestamptz;
  v_ms timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  select * into s from public.plan_settings();
  if p_team is not null then
    select * into t from public.teams where id = p_team;
    if t.id is null then return; end if;
    if t.billing_interval = 'year' and t.current_period_start is not null then
      select uw.window_start, uw.window_end into v_ps, v_pe from public.usage_window(t.current_period_start, now()) uw;
    else
      v_ps := coalesce(t.current_period_start, date_trunc('month', now()));
      v_pe := coalesce(t.current_period_end, date_trunc('month', now()) + interval '1 month');
    end if;
    return query select
      'team'::text, v_ps, v_pe,
      (select coalesce(sum(g.billed_micros), 0)::bigint from public.generations g
        where g.team_id = p_team and g.created_at >= v_ps and g.created_at < v_pe),
      s.pro_included_micros * greatest(t.seats, 1),
      t.spend_cap_micros, t.alert_thresholds, t.alerts_sent;
    return;
  end if;

  select * into p from public.profiles where id = p_user;
  if coalesce(p.plan, 'free') = 'pro' then
    if p.billing_interval = 'year' and p.current_period_start is not null then
      select uw.window_start, uw.window_end into v_ps, v_pe from public.usage_window(p.current_period_start, now()) uw;
    else
      v_ps := coalesce(p.current_period_start, v_ms);
      v_pe := coalesce(p.current_period_end, v_ms + interval '1 month');
    end if;
  else
    v_ps := v_ms;
    v_pe := v_ms + interval '1 month';
  end if;
  return query select
    coalesce(p.plan, 'free'), v_ps, v_pe,
    (select coalesce(sum(g.billed_micros), 0)::bigint from public.generations g
      where g.user_id = p_user and g.team_id is null and g.created_at >= v_ps and g.created_at < v_pe),
    case when coalesce(p.plan, 'free') = 'pro' then s.pro_included_micros else 0::bigint end,
    p.spend_cap_micros, coalesce(p.alert_thresholds, '{50,80,100}'), coalesce(p.alerts_sent, '{}'::jsonb);
end
$$;
revoke execute on function public.account_usage(uuid, uuid) from public, anon, authenticated;
grant execute on function public.account_usage(uuid, uuid) to service_role;

-- ---- Claiming a build: kind, plus the spend cap -------------------------------------------
drop function public.claim_generation(uuid);
create function public.claim_generation(p_project uuid, p_kind text default 'build')
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
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v_role is null or v_role not in ('owner', 'editor') then raise exception 'forbidden'; end if;
  if p_kind not in ('build', 'variant', 'fix', 'ai_copy', 'export', 'voice') then raise exception 'bad_kind'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into q from public.build_quota(p_project);
  if q.used >= q.build_limit then
    if q.plan in ('pro', 'team') then raise exception 'daily_limit_reached'; end if;
    raise exception 'free_limit_reached';
  end if;
  -- The cap is checked when work starts, never part-way through a planned build.
  if q.plan in ('pro', 'team') then
    select * into a from public.account_usage(auth.uid(), q.team_id);
    if a.spend_cap_micros is not null and a.usage_micros >= a.spend_cap_micros then
      raise exception 'spend_cap_reached';
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

-- ---- Usage alerts in the Inbox --------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('comment', 'reply', 'approved', 'changes', 'build_done', 'build_failed', 'usage_alert', 'spend_cap'));

alter table public.profiles alter column notify_email
  set default '{"comments": true, "reviews": true, "builds": true, "billing": true}'::jsonb;

-- After a build is billed: post an alert for each threshold of the included usage it crossed,
-- and one when the spend cap is reached. Each goes out once a period. Team alerts go to admins.
create or replace function public.check_usage_alerts(p_generation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record; a record;
  v_key text; v_sent jsonb; v_done int[]; v_new int[] := '{}'; v_cap_hit boolean := false;
  v_t int; v_to uuid[]; v_body text;
begin
  select user_id, team_id into g from public.generations where id = p_generation;
  if g.user_id is null then return; end if;
  select * into a from public.account_usage(g.user_id, g.team_id);
  if a.plan not in ('pro', 'team') then return; end if;

  v_key := to_char(a.period_start at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS');
  v_sent := case when a.alerts_sent ->> 'period' = v_key then a.alerts_sent
                 else jsonb_build_object('period', v_key, 'sent', '[]'::jsonb, 'cap', false) end;
  select coalesce(array_agg(x::int), '{}') into v_done from jsonb_array_elements_text(v_sent -> 'sent') x;

  if a.included_micros > 0 then
    foreach v_t in array (select array_agg(t order by t) from unnest(a.alert_thresholds) t) loop
      if a.usage_micros * 100 >= a.included_micros * v_t and not (v_t = any (v_done)) then
        v_new := v_new || v_t;
      end if;
    end loop;
  end if;
  if a.spend_cap_micros is not null and a.usage_micros >= a.spend_cap_micros
     and coalesce((v_sent ->> 'cap')::boolean, false) = false then
    v_cap_hit := true;
  end if;
  if cardinality(v_new) = 0 and not v_cap_hit then return; end if;

  if g.team_id is not null then
    select array_agg(m.user_id) into v_to from public.team_members m
      where m.team_id = g.team_id and m.role = 'admin' and m.status = 'active' and m.user_id is not null;
  else
    v_to := array[g.user_id];
  end if;

  if cardinality(v_new) > 0 then
    -- One alert for the highest threshold crossed by this build.
    v_t := v_new[cardinality(v_new)];
    v_body := format('%s%% of this period''s included AI usage used: $%s of $%s.',
      v_t, to_char(a.usage_micros / 1e6, 'FM999990.00'), to_char(a.included_micros / 1e6, 'FM999990.00'));
    insert into public.notifications (user_id, kind, body)
      select u, 'usage_alert', v_body from unnest(v_to) u;
  end if;
  if v_cap_hit then
    v_body := format('Spend cap of $%s reached. New builds are paused until you raise the cap or the period resets.',
      to_char(a.spend_cap_micros / 1e6, 'FM999990.00'));
    insert into public.notifications (user_id, kind, body)
      select u, 'spend_cap', v_body from unnest(v_to) u;
  end if;

  v_sent := jsonb_set(v_sent, '{sent}', to_jsonb(v_done || v_new));
  if v_cap_hit then v_sent := jsonb_set(v_sent, '{cap}', 'true'::jsonb); end if;
  if g.team_id is not null then
    update public.teams set alerts_sent = v_sent where id = g.team_id;
  else
    update public.profiles set alerts_sent = v_sent where id = g.user_id;
  end if;
end
$$;
revoke execute on function public.check_usage_alerts(uuid) from public, anon, authenticated;
grant execute on function public.check_usage_alerts(uuid) to service_role;

-- Finishing a build also records how long it took and checks usage alerts.
create or replace function public.finish_generation(
  p_id uuid, p_status text, p_input_tokens int, p_output_tokens int, p_cost_micros bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_updated int;
begin
  update public.generations g
    set status = p_status,
        input_tokens = p_input_tokens,
        output_tokens = p_output_tokens,
        duration_ms = least(greatest(extract(epoch from (now() - g.created_at)) * 1000, 0), 2147483647)::int,
        cost_micros = greatest(coalesce(p_cost_micros, 0), 0),
        billed_micros = case
          when p_status = 'failed' then 0
          else ceil(greatest(coalesce(p_cost_micros, 0), 0) * (select s.usage_markup from public.plan_settings() s))::bigint
        end
    where g.id = p_id and g.status = 'started' and p_status in ('succeeded', 'failed');
  get diagnostics v_updated = row_count;
  if v_updated > 0 and p_status = 'succeeded' then
    perform public.check_usage_alerts(p_id);
  end if;
end
$$;
revoke execute on function public.finish_generation(uuid, text, int, int, bigint) from public, anon, authenticated;
grant execute on function public.finish_generation(uuid, text, int, int, bigint) to service_role;

-- ---- The Usage tab ------------------------------------------------------------------------
-- Which account's usage the caller may see, and whether they see everyone's builds in it.
-- Personal (p_team null): the caller's own. A Team Pro team: any active admin or member sees
-- the team's totals; admins see every member's builds, members see their own.
create or replace function public.usage_scope(p_team uuid)
returns table (account_team uuid, see_all boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_team is null then
    return query select null::uuid, true;
    return;
  end if;
  select m.role into v_role from public.team_members m
    where m.team_id = p_team and m.user_id = auth.uid() and m.status = 'active';
  if v_role is null or v_role not in ('admin', 'member') then raise exception 'forbidden'; end if;
  return query select p_team, v_role = 'admin';
end
$$;
revoke execute on function public.usage_scope(uuid) from public, anon;

-- Totals, the daily series by kind, and spend by project and by member for the current period.
create or replace function public.usage_overview(p_team uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  sc record; a record; v jsonb;
begin
  select * into sc from public.usage_scope(p_team);
  select * into a from public.account_usage(auth.uid(), sc.account_team);
  with mine as (
    select g.* from public.generations g
    where g.created_at >= a.period_start and g.created_at < a.period_end
      and (case when sc.account_team is null then g.user_id = auth.uid() and g.team_id is null
                else g.team_id = sc.account_team end)
  ),
  visible as (select * from mine where sc.see_all or user_id = auth.uid())
  select jsonb_build_object(
    'plan', a.plan,
    'period_start', a.period_start,
    'period_end', a.period_end,
    'usage_micros', a.usage_micros,
    'included_micros', a.included_micros,
    'spend_cap_micros', a.spend_cap_micros,
    'alert_thresholds', to_jsonb(a.alert_thresholds),
    'see_all', sc.see_all,
    'builds', (select count(*) from visible where status = 'succeeded'),
    'failed', (select count(*) from visible where status = 'failed'),
    'running', (select count(*) from visible where status = 'started'),
    'duration_ms', (select coalesce(sum(duration_ms), 0) from visible),
    'by_kind', (select coalesce(jsonb_object_agg(kind, m), '{}'::jsonb) from (
        select kind, sum(coalesce(billed_micros, 0)) m from visible group by kind) k),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'kind', d.kind, 'micros', d.m)
                order by d.day, d.kind), '[]'::jsonb) from (
        select to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day, kind, sum(coalesce(billed_micros, 0)) as m
        from visible group by 1, 2) d),
    'by_project', (select coalesce(jsonb_agg(p order by (p ->> 'micros')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'project_id', v.project_id,
          'name', coalesce(pr.name, 'Deleted prototype'),
          'micros', sum(coalesce(v.billed_micros, 0)),
          'builds', count(*) filter (where v.status = 'succeeded'),
          'failed', count(*) filter (where v.status = 'failed')) p
        from visible v left join public.projects pr on pr.id = v.project_id
        group by v.project_id, pr.name) y),
    'by_member', case when sc.account_team is null or not sc.see_all then '[]'::jsonb else
      (select coalesce(jsonb_agg(m order by (m ->> 'micros')::bigint desc), '[]'::jsonb) from (
        select jsonb_build_object(
          'user_id', v.user_id,
          'name', coalesce(nullif(pf.display_name, ''), pf.email, 'Former member'),
          'micros', sum(coalesce(v.billed_micros, 0)),
          'builds', count(*) filter (where v.status = 'succeeded')) m
        from visible v left join public.profiles pf on pf.id = v.user_id
        group by v.user_id, pf.display_name, pf.email) z) end
  ) into v;
  return v;
end
$$;
revoke execute on function public.usage_overview(uuid) from public, anon;
grant execute on function public.usage_overview(uuid) to authenticated;

-- Every build in the current or an earlier period, newest first, one page at a time.
-- A planned build is one row; its steps come along so the ledger can expand them.
create or replace function public.usage_ledger(
  p_team uuid default null,
  p_before timestamptz default null,
  p_limit int default 50,
  p_project uuid default null,
  p_kind text default null,
  p_since timestamptz default null
)
returns table (
  id uuid,
  created_at timestamptz,
  project_id uuid,
  project_name text,
  user_name text,
  kind text,
  status text,
  version_number int,
  input_tokens int,
  output_tokens int,
  duration_ms int,
  billed_micros bigint,
  steps jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare sc record;
begin
  select * into sc from public.usage_scope(p_team);
  return query
  select g.id, g.created_at, g.project_id, coalesce(pr.name, 'Deleted prototype'),
    coalesce(nullif(pf.display_name, ''), pf.email),
    g.kind, g.status, v.number, g.input_tokens, g.output_tokens, g.duration_ms,
    coalesce(g.billed_micros, 0)::bigint,
    (select coalesce(jsonb_agg(jsonb_build_object('title', s ->> 'title', 'status', s ->> 'status')), '[]'::jsonb)
       from public.build_runs r, jsonb_array_elements(r.steps) s where r.generation_id = g.id)
  from public.generations g
  left join public.projects pr on pr.id = g.project_id
  left join public.profiles pf on pf.id = g.user_id
  left join public.versions v on v.id = coalesce(g.version_id,
    (select r.version_id from public.build_runs r where r.generation_id = g.id limit 1))
  where (case when sc.account_team is null then g.user_id = auth.uid() and g.team_id is null
              else g.team_id = sc.account_team and (sc.see_all or g.user_id = auth.uid()) end)
    and (p_before is null or g.created_at < p_before)
    and (p_since is null or g.created_at >= p_since)
    and (p_project is null or g.project_id = p_project)
    and (p_kind is null or g.kind = p_kind)
  order by g.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 5000);
end
$$;
revoke execute on function public.usage_ledger(uuid, timestamptz, int, uuid, text, timestamptz) from public, anon;
grant execute on function public.usage_ledger(uuid, timestamptz, int, uuid, text, timestamptz) to authenticated;
