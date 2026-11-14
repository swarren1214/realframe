-- Review rounds and fix from feedback.
--
-- Review round: an owner or editor asks named people to review one version, optionally by a due
-- date. Each reviewer approves or asks for changes. With rule 'all' the round is approved when
-- everyone approves; with 'any', when anyone does. Any request for changes marks the round
-- 'changes_requested'. Reviewers can change their answer until the round is closed. Starting a
-- new round closes the previous one.
--
-- Fix from feedback: a build made from selected comment threads marks each thread
-- addressed in the version it produced.

create table public.review_rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.versions(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(note) <= 2000),
  due_at timestamptz,
  rule text not null default 'all' check (rule in ('all', 'any')),
  status text not null default 'open' check (status in ('open', 'approved', 'changes_requested')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index review_rounds_project_idx on public.review_rounds (project_id, created_at desc);
-- At most one active round per prototype.
create unique index review_rounds_one_active on public.review_rounds (project_id) where closed_at is null;

create table public.review_requests (
  round_id uuid not null references public.review_rounds(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null check (email = lower(email)),
  user_id uuid references auth.users(id) on delete set null,
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'changes_requested')),
  decided_at timestamptz,
  primary key (round_id, email)
);
create index review_requests_user_idx on public.review_requests (user_id);

alter table public.review_rounds enable row level security;
alter table public.review_requests enable row level security;

create policy "rounds: members read" on public.review_rounds
  for select to authenticated using (
    public.project_role(project_id) in ('owner', 'editor', 'commenter', 'viewer')
  );
create policy "round requests: members read" on public.review_requests
  for select to authenticated using (
    public.project_role(project_id) in ('owner', 'editor', 'commenter', 'viewer')
  );
-- Writes go through the functions below only.

-- Status from the decisions so far.
create or replace function public.review_round_status(p_round uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when bool_or(q.decision = 'changes_requested') then 'changes_requested'
    when r.rule = 'all' and bool_and(q.decision = 'approved') then 'approved'
    when r.rule = 'any' and bool_or(q.decision = 'approved') then 'approved'
    else 'open'
  end
  from public.review_rounds r join public.review_requests q on q.round_id = r.id
  where r.id = p_round
  group by r.rule
$$;
revoke execute on function public.review_round_status(uuid) from public, anon, authenticated;

-- Start a round. People without access to the prototype are invited as commenters.
create or replace function public.request_review(
  p_project uuid,
  p_version uuid,
  p_emails text[],
  p_note text default null,
  p_due timestamptz default null,
  p_rule text default 'all'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project);
  v_team uuid;
  v_owner uuid;
  v_round uuid;
  v_email text;
  v_emails text[];
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if v_role is null or v_role not in ('owner', 'editor') then
    raise exception 'Only builders on this prototype can request a review.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.versions where id = p_version and project_id = p_project) then
    raise exception 'That version isn''t part of this prototype.';
  end if;
  if p_rule not in ('all', 'any') then raise exception 'Pick who has to approve.'; end if;
  select array_agg(distinct e) into v_emails
    from (select lower(btrim(x)) as e from unnest(p_emails) x) s
    where e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  if v_emails is null or cardinality(v_emails) = 0 then raise exception 'Add at least one reviewer.'; end if;
  if cardinality(v_emails) > 50 then raise exception 'A round can have up to 50 reviewers.'; end if;

  select team_id, owner_id into v_team, v_owner from public.projects where id = p_project;

  update public.review_rounds set closed_at = now()
    where project_id = p_project and closed_at is null;
  insert into public.review_rounds (project_id, version_id, requested_by, note, due_at, rule)
    values (p_project, p_version, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''), p_due, p_rule)
    returning id into v_round;

  foreach v_email in array v_emails loop
    insert into public.review_requests (round_id, project_id, email, user_id)
      values (v_round, p_project, v_email, (select id from public.profiles where email = v_email limit 1));
    -- Give access to anyone who doesn't have it yet.
    if not exists (select 1 from public.profiles pr where pr.id = v_owner and pr.email = v_email)
       and not (v_team is not null and exists (
         select 1 from public.team_members m where m.team_id = v_team and m.email = v_email and m.status = 'active'))
       and not exists (select 1 from public.project_members m where m.project_id = p_project and m.email = v_email)
    then
      insert into public.project_members (project_id, email, user_id, role, invited_by)
        values (p_project, v_email, (select id from public.profiles where email = v_email limit 1), 'commenter', auth.uid());
    end if;
  end loop;
  return v_round;
end
$$;
revoke execute on function public.request_review(uuid, uuid, text[], text, timestamptz, text) from public, anon;
grant execute on function public.request_review(uuid, uuid, text[], text, timestamptz, text) to authenticated;

-- A reviewer's answer. Returns the round's status afterwards.
create or replace function public.decide_review(p_round uuid, p_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_status text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_decision not in ('approved', 'changes_requested', 'pending') then raise exception 'Unknown decision.'; end if;
  if not exists (select 1 from public.review_rounds where id = p_round and closed_at is null) then
    raise exception 'This review round has closed.';
  end if;
  update public.review_requests
    set decision = p_decision,
        decided_at = case when p_decision = 'pending' then null else now() end,
        user_id = auth.uid()
    where round_id = p_round and (user_id = auth.uid() or email = v_email);
  if not found then
    raise exception 'You weren''t asked to review this round.' using errcode = '42501';
  end if;
  v_status := public.review_round_status(p_round);
  update public.review_rounds set status = v_status where id = p_round;
  return v_status;
end
$$;
revoke execute on function public.decide_review(uuid, text) from public, anon;
grant execute on function public.decide_review(uuid, text) to authenticated;

create or replace function public.close_review(p_round uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_project uuid;
begin
  select project_id into v_project from public.review_rounds where id = p_round;
  if v_project is null or public.project_role(v_project) not in ('owner', 'editor') then
    raise exception 'Only builders on this prototype can close a review round.' using errcode = '42501';
  end if;
  update public.review_rounds set closed_at = coalesce(closed_at, now()) where id = p_round;
end
$$;
revoke execute on function public.close_review(uuid) from public, anon;
grant execute on function public.close_review(uuid) to authenticated;

-- ---- Fix from feedback ------------------------------------------------------------------
alter table public.comment_threads
  add column addressed_version_id uuid references public.versions(id) on delete set null;

create or replace function public.mark_threads_addressed(p_project uuid, p_threads uuid[], p_version uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  if public.project_role(p_project) is null or public.project_role(p_project) not in ('owner', 'editor') then
    raise exception 'Only builders on this prototype can mark feedback addressed.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.versions where id = p_version and project_id = p_project) then
    raise exception 'That version isn''t part of this prototype.';
  end if;
  update public.comment_threads set addressed_version_id = p_version
    where project_id = p_project and id = any(p_threads);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke execute on function public.mark_threads_addressed(uuid, uuid[], uuid) from public, anon;
grant execute on function public.mark_threads_addressed(uuid, uuid[], uuid) to authenticated;

-- Commenters can resolve threads (an existing policy) but not mark them addressed.
create or replace function public.guard_thread_addressed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.addressed_version_id is distinct from old.addressed_version_id
     and auth.uid() is not null
     and coalesce(public.project_role(new.project_id), '') not in ('owner', 'editor') then
    raise exception 'Only builders can mark feedback addressed.' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger comment_threads_guard_addressed
  before update on public.comment_threads
  for each row execute function public.guard_thread_addressed();
revoke execute on function public.guard_thread_addressed() from public, anon, authenticated;

alter publication supabase_realtime add table public.review_rounds, public.review_requests;
