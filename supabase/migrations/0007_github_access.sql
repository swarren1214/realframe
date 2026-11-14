-- Several Realframe users can use the same installation (for example teammates in one org).
create table public.github_installation_users (
  installation_id bigint not null references public.github_installations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (installation_id, user_id)
);
alter table public.github_installation_users enable row level security;
create policy "see your installation links" on public.github_installation_users
  for select to authenticated using (user_id = auth.uid());

drop policy "see installations you added" on public.github_installations;
create policy "see installations you can use" on public.github_installations
  for select to authenticated using (
    exists (select 1 from public.github_installation_users u where u.installation_id = id and u.user_id = auth.uid())
  );

-- The account that created Realframe's first user is the one allowed to run the one-time GitHub App setup.
create or replace function public.first_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users order by created_at limit 1
$$;
revoke execute on function public.first_user_id() from public, anon, authenticated;
grant execute on function public.first_user_id() to service_role;
