-- Realframe v1 schema: projects, members, versions, chat messages, comments.
-- Every table has RLS on. Access is decided by public.project_role().

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  access_mode text not null default 'invite' check (access_mode in ('invite', 'public')),
  published boolean not null default false,
  live_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null check (email = lower(email)),
  user_id uuid references auth.users(id) on delete set null,
  role text not null default 'commenter' check (role in ('viewer', 'commenter', 'editor')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number int not null,
  html text not null,
  prompt text,
  summary text,
  source text not null default 'ai' check (source in ('ai', 'restore')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, number)
);

alter table public.projects
  add constraint projects_live_version_fk
  foreign key (live_version_id) references public.versions(id) on delete set null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  version_id uuid references public.versions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index messages_project_idx on public.messages (project_id, created_at);

create table public.comment_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.versions(id) on delete cascade,
  x real not null check (x >= 0 and x <= 1),
  y real not null check (y >= 0 and y <= 1),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index comment_threads_project_idx on public.comment_threads (project_id, created_at);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.comment_threads(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_email text not null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index comments_thread_idx on public.comments (thread_id, created_at);

-- The caller's best role on a project: owner, editor, commenter, viewer,
-- public (published + public mode), or null.
create or replace function public.project_role(p uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.projects pr where pr.id = p and pr.owner_id = auth.uid()) then 'owner'
    else coalesce(
      (select m.role from public.project_members m
        where m.project_id = p
          and (m.user_id = auth.uid() or m.email = lower(coalesce(auth.jwt() ->> 'email', '')))
        limit 1),
      (select 'public' from public.projects pr
        where pr.id = p and pr.published and pr.access_mode = 'public')
    )
  end
$$;

-- New users: create a profile and claim any pending invites for their email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, lower(new.email))
    on conflict (id) do nothing;
  update public.project_members set user_id = new.id
    where email = lower(new.email) and user_id is null;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Versions are numbered per project. Only owners and editors may create them.
create or replace function public.create_version(
  p_project uuid, p_html text, p_prompt text, p_summary text, p_source text default 'ai'
)
returns public.versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project);
  v_next int;
  v_row public.versions;
begin
  if auth.uid() is null or v_role is null or v_role not in ('owner', 'editor') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform 1 from public.projects where id = p_project for update;
  select coalesce(max(number), 0) + 1 into v_next from public.versions where project_id = p_project;
  insert into public.versions (project_id, number, html, prompt, summary, source, created_by)
    values (p_project, v_next, p_html, p_prompt, p_summary, p_source, auth.uid())
    returning * into v_row;
  update public.projects set updated_at = now() where id = p_project;
  return v_row;
end
$$;

-- Start a comment thread with its first comment in one step.
create or replace function public.create_thread(
  p_project uuid, p_version uuid, p_x real, p_y real, p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.project_role(p_project);
  v_thread uuid;
begin
  if auth.uid() is null or v_role is null or v_role not in ('owner', 'editor', 'commenter') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.versions where id = p_version and project_id = p_project) then
    raise exception 'version not in project';
  end if;
  insert into public.comment_threads (project_id, version_id, x, y, created_by)
    values (p_project, p_version, p_x, p_y, auth.uid())
    returning id into v_thread;
  insert into public.comments (thread_id, project_id, author_id, author_email, body)
    values (v_thread, p_project, auth.uid(), coalesce(auth.jwt() ->> 'email', ''), p_body);
  return v_thread;
end
$$;

-- Row level security ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.versions enable row level security;
alter table public.messages enable row level security;
alter table public.comment_threads enable row level security;
alter table public.comments enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "projects: read with any role" on public.projects
  for select to anon, authenticated using (public.project_role(id) is not null);
create policy "projects: create own" on public.projects
  for insert to authenticated with check (owner_id = auth.uid());
create policy "projects: owner updates" on public.projects
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "projects: owner deletes" on public.projects
  for delete to authenticated using (owner_id = auth.uid());

create policy "members: owner or self reads" on public.project_members
  for select to authenticated using (
    public.project_role(project_id) = 'owner'
    or user_id = auth.uid()
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
create policy "members: owner adds" on public.project_members
  for insert to authenticated with check (public.project_role(project_id) = 'owner');
create policy "members: owner changes" on public.project_members
  for update to authenticated using (public.project_role(project_id) = 'owner');
create policy "members: owner removes" on public.project_members
  for delete to authenticated using (public.project_role(project_id) = 'owner');

create policy "versions: members read all, public reads live" on public.versions
  for select to anon, authenticated using (
    public.project_role(project_id) in ('owner', 'editor', 'commenter', 'viewer')
    or (
      public.project_role(project_id) = 'public'
      and id = (select pr.live_version_id from public.projects pr where pr.id = project_id)
    )
  );

create policy "messages: builders read" on public.messages
  for select to authenticated using (public.project_role(project_id) in ('owner', 'editor'));
create policy "messages: builders write" on public.messages
  for insert to authenticated with check (
    public.project_role(project_id) in ('owner', 'editor') and created_by = auth.uid()
  );

create policy "threads: members read" on public.comment_threads
  for select to authenticated using (
    public.project_role(project_id) in ('owner', 'editor', 'commenter', 'viewer')
  );
create policy "threads: commenters resolve" on public.comment_threads
  for update to authenticated using (
    public.project_role(project_id) in ('owner', 'editor', 'commenter')
  );

create policy "comments: members read" on public.comments
  for select to authenticated using (
    public.project_role(project_id) in ('owner', 'editor', 'commenter', 'viewer')
  );
create policy "comments: commenters write" on public.comments
  for insert to authenticated with check (
    public.project_role(project_id) in ('owner', 'editor', 'commenter') and author_id = auth.uid()
  );

-- Functions are callable only by signed-in users (project_role also by anon for RLS).
revoke execute on function public.create_version(uuid, text, text, text, text) from public, anon;
revoke execute on function public.create_thread(uuid, uuid, real, real, text) from public, anon;
grant execute on function public.create_version(uuid, text, text, text, text) to authenticated;
grant execute on function public.create_thread(uuid, uuid, real, real, text) to authenticated;

-- Live comment updates.
alter publication supabase_realtime add table public.comments, public.comment_threads;

-- The trigger function is never called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
