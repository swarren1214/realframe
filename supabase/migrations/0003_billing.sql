-- Billing: Free and Pro plans, per-build cost tracking, and monthly usage overage.
--
-- Free: 30 builds per calendar month (UTC).
-- Pro:  $20/month via Stripe, includes $10 of AI usage per billing period;
--       usage beyond that is billed at cost + 50% on the next renewal invoice.
--       A daily safety cap (150 builds/24h) guards against runaway usage.

alter table public.profiles
  add column plan text not null default 'free' check (plan in ('free', 'pro')),
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text,
  add column subscription_status text,
  add column current_period_start timestamptz,
  add column current_period_end timestamptz,
  add column cancel_at_period_end boolean not null default false;

-- daily_generation_limit becomes a general per-user override of the plan's build limit.
alter table public.profiles rename column daily_generation_limit to build_limit_override;

-- Cost per build in micro-USD: raw model cost, and what the customer is billed (cost + markup).
alter table public.generations
  add column cost_micros bigint,
  add column billed_micros bigint,
  add column billed_invoice_id text;

-- Plan constants live in one place.
create or replace function public.plan_settings()
returns table (free_monthly_builds int, pro_daily_builds int, pro_included_micros bigint, usage_markup numeric)
language sql immutable set search_path = ''
as $$ select 30, 150, 10000000::bigint, 1.5::numeric $$;

drop function if exists public.default_daily_generation_limit();

-- The caller's plan, build allowance and usage for the current period.
drop function if exists public.generation_quota();
create function public.generation_quota()
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
      -- Window the build count is measured over.
      case when p.plan = 'pro' then now() - interval '24 hours'
           else date_trunc('month', now() at time zone 'utc') at time zone 'utc' end as count_from,
      -- Billing period shown to the user.
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
    (select count(*)::int from public.generations g where g.user_id = auth.uid() and g.created_at >= w.count_from),
    greatest(w.lim - (select count(*)::int from public.generations g where g.user_id = auth.uid() and g.created_at >= w.count_from), 0),
    w.ps,
    w.pe,
    (select coalesce(sum(g.billed_micros), 0)::bigint from public.generations g
      where g.user_id = auth.uid() and g.created_at >= w.ps and g.created_at < w.pe),
    w.inc
  from w
$$;

create or replace function public.claim_generation(p_project uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project);
  v_plan text;
  v_limit int;
  v_used int;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v_role is null or v_role not in ('owner', 'editor') then raise exception 'forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select q.plan, q.build_limit, q.used into v_plan, v_limit, v_used from public.generation_quota() q;
  if v_used >= v_limit then
    if v_plan = 'pro' then raise exception 'daily_limit_reached'; end if;
    raise exception 'free_limit_reached';
  end if;
  insert into public.generations (user_id, project_id) values (auth.uid(), p_project) returning id into v_id;
  return v_id;
end
$$;

-- Record how a claimed build ended and what it cost. Billed amount is cost + markup.
-- Server-only (service role): users must not be able to report their own cost.
drop function if exists public.finish_generation(uuid, text, int, int);
create function public.finish_generation(
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
        billed_micros = ceil(greatest(coalesce(p_cost_micros, 0), 0) * (select s.usage_markup from public.plan_settings() s))::bigint
    where g.id = p_id and g.status = 'started' and p_status in ('succeeded', 'failed')
$$;

revoke execute on function public.generation_quota() from public, anon;
revoke execute on function public.claim_generation(uuid) from public, anon;
revoke execute on function public.finish_generation(uuid, text, int, int, bigint) from public, anon, authenticated;
grant execute on function public.generation_quota() to authenticated;
grant execute on function public.claim_generation(uuid) to authenticated;
grant execute on function public.finish_generation(uuid, text, int, int, bigint) to service_role;
