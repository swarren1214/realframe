-- Self-service sign-up: display names, onboarding, and a per-user daily generation limit.

-- Profiles: a display name shown on comments, plus an optional per-user limit override.
alter table public.profiles
  add column display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  add column onboarded_at timestamptz,
  add column daily_generation_limit int check (daily_generation_limit is null or daily_generation_limit >= 0);

-- Users can change their own name and onboarding state, but not their limit.
revoke update on public.profiles from authenticated;
grant update (display_name, onboarded_at) on public.profiles to authenticated;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Comments carry the author's name at the time they were written.
alter table public.comments add column author_name text;

create or replace function public.set_comment_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := auth.uid();
  new.author_email := coalesce(auth.jwt() ->> 'email', new.author_email);
  select nullif(btrim(p.display_name), '') into new.author_name from public.profiles p where p.id = auth.uid();
  return new;
end
$$;
revoke execute on function public.set_comment_author() from public, anon, authenticated;

create trigger comments_set_author
  before insert on public.comments
  for each row execute function public.set_comment_author();

-- Usage ledger: one row per generation attempt.
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  status text not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index generations_user_idx on public.generations (user_id, created_at desc);
create index generations_project_idx on public.generations (project_id);
alter table public.generations enable row level security;
create policy "generations: read own" on public.generations
  for select to authenticated using (user_id = (select auth.uid()));

-- Default daily limit for everyone without an override.
create or replace function public.default_daily_generation_limit()
returns int language sql immutable set search_path = '' as $$ select 25 $$;

-- The caller's limit, how many attempts they've made in the last 24 hours, and what's left.
create or replace function public.generation_quota()
returns table (daily_limit int, used int, remaining int)
language sql
stable
security definer
set search_path = ''
as $$
  with l as (
    select coalesce(
      (select p.daily_generation_limit from public.profiles p where p.id = auth.uid()),
      public.default_daily_generation_limit()
    ) as lim
  ), u as (
    select count(*)::int as n from public.generations g
    where g.user_id = auth.uid() and g.created_at > now() - interval '24 hours'
  )
  select l.lim, u.n, greatest(l.lim - u.n, 0) from l, u
$$;

-- Atomically reserve one generation for the caller on a project they can build.
-- Raises 'daily_limit_reached' when they're out.
create or replace function public.claim_generation(p_project uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project);
  v_limit int;
  v_used int;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v_role is null or v_role not in ('owner', 'editor') then raise exception 'forbidden'; end if;

  -- Serialize claims per user so two tabs can't both take the last one.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select q.daily_limit, q.used into v_limit, v_used from public.generation_quota() q;
  if v_used >= v_limit then raise exception 'daily_limit_reached'; end if;

  insert into public.generations (user_id, project_id) values (auth.uid(), p_project) returning id into v_id;
  return v_id;
end
$$;

-- Record how a claimed generation ended. Every attempt counts toward the limit,
-- so callers can't free up quota by marking their own runs as failed.
create or replace function public.finish_generation(p_id uuid, p_status text, p_input_tokens int, p_output_tokens int)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.generations
    set status = p_status, input_tokens = p_input_tokens, output_tokens = p_output_tokens
    where id = p_id and user_id = auth.uid() and status = 'started' and p_status in ('succeeded', 'failed')
$$;

revoke execute on function public.generation_quota() from public, anon;
revoke execute on function public.claim_generation(uuid) from public, anon;
revoke execute on function public.finish_generation(uuid, text, int, int) from public, anon;
grant execute on function public.generation_quota() to authenticated;
grant execute on function public.claim_generation(uuid) to authenticated;
grant execute on function public.finish_generation(uuid, text, int, int) to authenticated;
