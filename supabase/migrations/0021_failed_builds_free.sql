-- Failed builds no longer count toward the free or daily build limit.
-- In-progress builds still count, so parallel requests can't exceed it.

CREATE OR REPLACE FUNCTION public.build_quota(p_project uuid)
 RETURNS TABLE(plan text, build_limit integer, used integer, remaining integer, period_start timestamp with time zone, period_end timestamp with time zone, usage_micros bigint, included_micros bigint, team_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_team record; v_s record; v_used int; v_usage bigint; v_ps timestamptz; v_pe timestamptz;
begin
  select t.* into v_team from public.projects pr join public.teams t on t.id = pr.team_id
    where pr.id = p_project and t.plan = 'team' and public.team_role(t.id) is not null;
  if v_team.id is null then
    return query select q.*, null::uuid from public.generation_quota() q;
    return;
  end if;
  select * into v_s from public.plan_settings();
  if v_team.billing_interval = 'year' and v_team.current_period_start is not null then
    select uw.window_start, uw.window_end into v_ps, v_pe from public.usage_window(v_team.current_period_start, now()) uw;
  else
    v_ps := coalesce(v_team.current_period_start, date_trunc('month', now()));
    v_pe := coalesce(v_team.current_period_end, date_trunc('month', now()) + interval '1 month');
  end if;
  select count(*)::int into v_used from public.generations g
    where g.user_id = auth.uid() and g.team_id = v_team.id and g.status <> 'failed'
      and g.created_at >= now() - interval '24 hours';
  select coalesce(sum(g.billed_micros), 0)::bigint into v_usage from public.generations g
    where g.team_id = v_team.id and g.created_at >= v_ps and g.created_at < v_pe;
  return query select
    'team'::text,
    v_s.pro_daily_builds,
    v_used,
    greatest(v_s.pro_daily_builds - v_used, 0),
    v_ps,
    v_pe,
    v_usage,
    v_s.pro_included_micros * greatest(v_team.seats, 1),
    v_team.id;
end
$function$;

CREATE OR REPLACE FUNCTION public.generation_quota()
 RETURNS TABLE(plan text, build_limit integer, used integer, remaining integer, period_start timestamp with time zone, period_end timestamp with time zone, usage_micros bigint, included_micros bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with s as (select * from public.plan_settings()),
  p as (
    select coalesce(pr.plan, 'free') as plan, pr.build_limit_override, pr.current_period_start,
           pr.current_period_end, coalesce(pr.billing_interval, 'month') as billing_interval
    from (select auth.uid() as id) me left join public.profiles pr on pr.id = me.id
  ),
  month_utc as (
    select date_trunc('month', now() at time zone 'utc') at time zone 'utc' as ms,
           (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc' as me
  ),
  win as (
    select uw.window_start, uw.window_end from p, public.usage_window(p.current_period_start, now()) uw
    where p.plan = 'pro' and p.billing_interval = 'year' and p.current_period_start is not null
  ),
  w as (
    select
      p.plan,
      case when p.plan = 'pro' then coalesce(p.build_limit_override, s.pro_daily_builds)
           else coalesce(p.build_limit_override, s.free_monthly_builds) end as lim,
      case when p.plan = 'pro' then now() - interval '24 hours' else m.ms end as count_from,
      case when p.plan = 'pro' then coalesce((select window_start from win), p.current_period_start, m.ms)
           else m.ms end as ps,
      case when p.plan = 'pro' then coalesce((select window_end from win), p.current_period_end, m.me)
           else m.me end as pe,
      case when p.plan = 'pro' then s.pro_included_micros else 0 end as inc
    from p, s, month_utc m
  ),
  -- Failed builds don't count toward the limit.
  used as (
    select count(*)::int as n from public.generations g, w
    where g.user_id = auth.uid() and g.team_id is null and g.status <> 'failed'
      and g.created_at >= w.count_from
  )
  select
    w.plan,
    w.lim,
    used.n,
    greatest(w.lim - used.n, 0),
    w.ps,
    w.pe,
    (select coalesce(sum(g.billed_micros), 0)::bigint from public.generations g
      where g.user_id = auth.uid() and g.team_id is null and g.created_at >= w.ps and g.created_at < w.pe),
    w.inc
  from w, used
$function$;
