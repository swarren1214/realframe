-- Export: every export is logged with who, what and which version. File formats (HTML, ZIP,
-- the original app files, a part's HTML + CSS) are made in the browser and cost nothing; AI
-- formats (React project, React or Tailwind component) run as a build of kind 'export'.

create table public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version_id uuid references public.versions (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('prototype', 'selection')),
  format text not null
    check (format in ('html', 'zip', 'bundle', 'react', 'part-html', 'part-react', 'part-tailwind')),
  -- What was exported from a selection: [{ "label", "selector" }].
  selectors jsonb not null default '[]'::jsonb check (jsonb_typeof(selectors) = 'array'),
  generation_id uuid references public.generations (id) on delete set null,
  created_at timestamptz not null default now()
);

create index exports_project_idx on public.exports (project_id, created_at desc);
create index exports_user_idx on public.exports (user_id);

alter table public.exports enable row level security;

-- Builders on a prototype log their own exports.
create policy "exports: builders log their own" on public.exports
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.project_role(project_id) in ('owner', 'editor')
  );

-- The prototype's owner sees every export of it; everyone sees their own.
create policy "exports: owner and exporter read" on public.exports
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid()))
  );

revoke all on public.exports from anon;
grant select, insert on public.exports to authenticated;
