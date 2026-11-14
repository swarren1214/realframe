-- Annual billing. Pro and Team can be paid yearly. The included AI usage still resets every
-- month, and usage beyond it is still billed every month, so quotas are measured in one-month
-- windows counted from the subscription's start. For monthly plans a window is the billing period.

alter table public.profiles
  add column billing_interval text not null default 'month' check (billing_interval in ('month', 'year'));
alter table public.teams
  add column billing_interval text not null default 'month' check (billing_interval in ('month', 'year'));

-- Builds billed on a monthly usage invoice for an annual plan are stamped like renewal invoices.
create index if not exists generations_unbilled_idx on public.generations (created_at) where billed_invoice_id is null;

-- The one-month window counted from `p_anchor` that contains `p_at`. Month-end anchors clamp like
-- Stripe: Jan 31 → Feb 28 → Mar 31. Computed in UTC. Mirrors src/lib/usage-window.ts.
create or replace function public.usage_window(p_anchor timestamptz, p_at timestamptz default now())
returns table (window_start timestamptz, window_end timestamptz)
language plpgsql
immutable
set search_path = ''
as $$
declare
  a timestamp := p_anchor at time zone 'utc';
  t timestamp := p_at at time zone 'utc';
  n int := (extract(year from t)::int - extract(year from a)::int) * 12
           + (extract(month from t)::int - extract(month from a)::int);
begin
  if a + make_interval(months => n) > t then n := n - 1; end if;
  return query select
    (a + make_interval(months => n)) at time zone 'utc',
    (a + make_interval(months => n + 1)) at time zone 'utc';
end
$$;
grant execute on function public.usage_window(timestamptz, timestamptz) to authenticated, service_role;

-- Personal quota: annual Pro reports the current month's window.
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

-- Team quota: annual Team Pro reports the current month's window.
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
    where g.user_id = auth.uid() and g.team_id = v_team.id and g.created_at >= now() - interval '24 hours';
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
$$;
revoke execute on function public.build_quota(uuid) from public, anon;
grant execute on function public.build_quota(uuid) to authenticated;
