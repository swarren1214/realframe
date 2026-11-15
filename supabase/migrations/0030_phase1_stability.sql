-- Phase 1 of the engineering review: billing that can't miss or double-bill builds,
-- a sweeper for work stuck after a time limit, and one build at a time per prototype.

-- ---- Usage billing ---------------------------------------------------------------------

-- One row per account and usage window ever billed. The unique key is what stops a window
-- from being invoiced twice, however many times billing runs or a webhook is retried.
create table public.usage_bills (
  id uuid primary key default gen_random_uuid(),
  account_kind text not null check (account_kind in ('user', 'team')),
  account_id uuid not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  -- The Stripe invoice the overage went on, or 'included-…' when there was none to bill.
  invoice_id text,
  billed_micros bigint,
  overage_micros bigint,
  builds int,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (account_kind, account_id, window_start)
);
alter table public.usage_bills enable row level security;
-- Service role only: no policies.

-- Unbilled, finished builds for an account in [p_from, p_to): their billed total and count.
-- Builds still running aren't counted; the sweeper settles them within minutes.
create or replace function public.unbilled_usage(
  p_user uuid, p_team uuid, p_from timestamptz, p_to timestamptz
)
returns table (billed_micros bigint, builds int)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(g.billed_micros), 0)::bigint, count(*)::int
  from public.generations g
  where g.billed_invoice_id is null
    and g.status <> 'started'
    and g.created_at >= p_from and g.created_at < p_to
    and (
      (p_team is not null and g.team_id = p_team)
      or (p_team is null and g.user_id = p_user and g.team_id is null)
    )
$$;

-- Marks every unbilled, finished build in the window as billed on p_stamp. Returns how many.
create or replace function public.stamp_usage(
  p_user uuid, p_team uuid, p_from timestamptz, p_to timestamptz, p_stamp text
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  if p_stamp is null or p_stamp = '' then raise exception 'bad_stamp'; end if;
  update public.generations g
    set billed_invoice_id = p_stamp
    where g.billed_invoice_id is null
      and g.status <> 'started'
      and g.created_at >= p_from and g.created_at < p_to
      and (
        (p_team is not null and g.team_id = p_team)
        or (p_team is null and g.user_id = p_user and g.team_id is null)
      );
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Takes the ledger row for a window, creating it the first time. Returns the row either way,
-- so a rerun finds the invoice an earlier run made instead of making another.
create or replace function public.claim_usage_bill(
  p_kind text, p_account uuid, p_start timestamptz, p_end timestamptz
)
returns public.usage_bills
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.usage_bills;
begin
  insert into public.usage_bills (account_kind, account_id, window_start, window_end)
    values (p_kind, p_account, p_start, p_end)
    on conflict (account_kind, account_id, window_start) do nothing;
  select * into v_row from public.usage_bills
    where account_kind = p_kind and account_id = p_account and window_start = p_start;
  return v_row;
end
$$;

revoke execute on function public.unbilled_usage(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.stamp_usage(uuid, uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.claim_usage_bill(text, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ---- Sweeper ---------------------------------------------------------------------------

-- Work a request started but never finished, because the request hit its time limit, the
-- server restarted, or the browser driving a planned build went away. Called every few
-- minutes by /api/cron/sweep. Safe to run any time and as often as you like.
--
-- * A planned build with no progress for 15 minutes is settled: steps that finished are kept
--   as a version and charged, like a cancelled run; with none finished it ends free.
-- * Any other build still "started" after 15 minutes ends as failed, free.
create or replace function public.sweep_stale_work()
returns table (runs_settled int, runs_failed int, builds_failed int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_done int;
  v_total int;
  v_next int;
  v_version uuid;
  v_settled int := 0;
  v_failed int := 0;
  v_builds int := 0;
begin
  for r in
    select * from public.build_runs
    where status = 'running' and updated_at < now() - interval '15 minutes'
    for update skip locked
  loop
    v_total := jsonb_array_length(r.steps);
    select count(*) into v_done from jsonb_array_elements(r.steps) s where s->>'status' = 'done';
    if v_done > 0 and r.working_html is not null then
      perform 1 from public.projects where id = r.project_id for update;
      select coalesce(max(number), 0) + 1 into v_next from public.versions where project_id = r.project_id;
      insert into public.versions (project_id, number, html, prompt, summary, source, created_by)
        values (
          r.project_id, v_next, r.working_html, r.prompt,
          format('Built %s of %s steps before the build stopped.', v_done, v_total),
          'ai', r.user_id
        )
        returning id into v_version;
      update public.projects set updated_at = now() where id = r.project_id;
      update public.build_runs
        set status = 'failed', running_step = null, working_html = null, version_id = v_version,
            error = 'Stopped: no progress for 15 minutes.', updated_at = now()
        where id = r.id;
      perform public.finish_generation(r.generation_id, 'succeeded', r.input_tokens, r.output_tokens, r.cost_micros);
      insert into public.messages (project_id, role, content, version_id, created_by)
        values (
          r.project_id, 'assistant',
          format('This build stopped after %s of %s steps (the page was closed or lost its connection). The finished steps are saved as v%s.', v_done, v_total, v_next),
          v_version, r.user_id
        );
      v_settled := v_settled + 1;
    else
      update public.build_runs
        set status = 'failed', running_step = null, working_html = null,
            error = 'Stopped: no progress for 15 minutes.', updated_at = now()
        where id = r.id;
      perform public.finish_generation(r.generation_id, 'failed', r.input_tokens, r.output_tokens, 0);
      insert into public.messages (project_id, role, content, created_by)
        values (r.project_id, 'assistant', 'This build stopped before any step finished (the page was closed or lost its connection). Nothing was charged.', r.user_id);
      v_failed := v_failed + 1;
    end if;
  end loop;

  -- Builds still "started" after 15 minutes, other than planned runs that are still moving.
  with stale as (
    select g.id from public.generations g
    where g.status = 'started' and g.created_at < now() - interval '15 minutes'
      and not exists (
        select 1 from public.build_runs b
        where b.generation_id = g.id and b.status = 'running'
      )
    for update of g skip locked
  )
  update public.generations g
    set status = 'failed', billed_micros = 0, cost_micros = coalesce(g.cost_micros, 0),
        duration_ms = least(greatest(extract(epoch from (now() - g.created_at)) * 1000, 0), 2147483647)::int
    from stale where g.id = stale.id;
  get diagnostics v_builds = row_count;

  return query select v_settled, v_failed, v_builds;
end
$$;
revoke execute on function public.sweep_stale_work() from public, anon, authenticated;

-- ---- One build at a time per prototype --------------------------------------------------

-- Two builds that change the same prototype at once both start from the same version, so the
-- second to finish would silently drop the first one's changes. Builds, fixes and AI copy
-- (which all save a new version) now take the prototype's slot; a second one is refused with
-- the name of whoever is building. Variants and exports don't change the prototype, so they
-- don't need the slot. A build "started" over 15 minutes ago no longer holds it (the sweeper
-- ends those), and a planned build holds it while its steps keep moving.
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
