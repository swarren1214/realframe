-- Notification emails: grouped, at most one per person every 15 minutes.

alter table public.profiles add column notified_at timestamptz;

-- Claims the next batch to email: each person's unemailed notifications that are
-- at least 2 minutes old (so a burst of replies lands together), for people not
-- emailed in the last 15 minutes. Rows are marked emailed as they're claimed, so
-- overlapping runs never send the same thing twice. Server only.
create or replace function public.claim_notification_digest()
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
    limit 200
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
      'kind', t.kind, 'project_id', t.project_id, 'project', pj.name, 'version_id', t.version_id,
      'version', v.number, 'actor', t.actor_name, 'body', t.body, 'created_at', t.created_at
    ) order by t.created_at)
  from taken t
  join public.profiles pr on pr.id = t.user_id
  left join public.projects pj on pj.id = t.project_id
  left join public.versions v on v.id = t.version_id
  group by pr.id, pr.email, pr.display_name, pr.notify_email;
end $$;

revoke execute on function public.claim_notification_digest() from public, anon, authenticated;
