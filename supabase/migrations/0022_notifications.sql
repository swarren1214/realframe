-- Inbox: one row per person per event, only for prototypes that person owns
-- (plus their own long builds). Written by triggers and the build finisher.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('comment', 'reply', 'approved', 'changes', 'build_done', 'build_failed')),
  project_id uuid references public.projects (id) on delete cascade,
  version_id uuid references public.versions (id) on delete set null,
  thread_id uuid references public.comment_threads (id) on delete cascade,
  actor_name text,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  emailed_at timestamptz
);

create index notifications_user_recent on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
create index notifications_unemailed on public.notifications (created_at) where emailed_at is null;

alter table public.notifications enable row level security;

create policy "Read your own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "Mark your own notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

alter publication supabase_realtime add table public.notifications;

-- Which notifications someone wants by email. Everything always shows in the Inbox.
alter table public.profiles
  add column notify_email jsonb not null default '{"comments": true, "reviews": true, "builds": true}'::jsonb;
grant update (notify_email) on public.profiles to authenticated;

-- A comment or reply on your prototype by someone else.
create or replace function public.notify_comment() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_version uuid; v_first boolean;
begin
  select p.owner_id into v_owner from public.projects p where p.id = new.project_id;
  if v_owner is null or new.author_id is not distinct from v_owner then return new; end if;
  select t.version_id into v_version from public.comment_threads t where t.id = new.thread_id;
  v_first := not exists (select 1 from public.comments c where c.thread_id = new.thread_id and c.id <> new.id);
  insert into public.notifications (user_id, kind, project_id, version_id, thread_id, actor_name, body)
  values (v_owner, case when v_first then 'comment' else 'reply' end, new.project_id, v_version, new.thread_id,
          coalesce(nullif(new.author_name, ''), new.author_email, 'Someone'), left(new.body, 280));
  return new;
end $$;

create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_comment();

-- A reviewer approved or asked for changes on your prototype.
create or replace function public.notify_review_decision() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_version uuid; v_name text;
begin
  if new.decision not in ('approved', 'changes_requested') or new.decision is not distinct from old.decision then
    return new;
  end if;
  select p.owner_id into v_owner from public.projects p where p.id = new.project_id;
  if v_owner is null or new.user_id is not distinct from v_owner then return new; end if;
  select r.version_id into v_version from public.review_rounds r where r.id = new.round_id;
  select coalesce(nullif(pr.display_name, ''), new.email) into v_name
    from (select 1) one left join public.profiles pr on pr.id = new.user_id;
  insert into public.notifications (user_id, kind, project_id, version_id, actor_name)
  values (v_owner, case when new.decision = 'approved' then 'approved' else 'changes' end,
          new.project_id, v_version, coalesce(v_name, new.email));
  return new;
end $$;

create trigger review_requests_notify after update of decision on public.review_requests
  for each row execute function public.notify_review_decision();

-- Bulk "mark all read" without a row-by-row round trip.
create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
  language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
