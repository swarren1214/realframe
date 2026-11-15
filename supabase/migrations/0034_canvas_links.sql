-- Flow map ------------------------------------------------------------------------
-- Links between a prototype's screens (hash routes), found by crawling it from the canvas.
-- The canvas draws an arrow between any two frames at the same size whose routes are linked.
-- Mapping again replaces the project's links.
create table public.canvas_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_route text not null check (char_length(from_route) <= 200),
  to_route text not null check (char_length(to_route) <= 200),
  label text not null default '' check (char_length(label) <= 40),
  created_at timestamptz not null default now(),
  unique (project_id, from_route, to_route)
);
create index canvas_links_project_idx on public.canvas_links (project_id);
alter table public.canvas_links enable row level security;
create policy "canvas links: builders read" on public.canvas_links
  for select to authenticated using (public.project_role(project_id) in ('owner', 'editor'));
create policy "canvas links: builders insert" on public.canvas_links
  for insert to authenticated with check (public.project_role(project_id) in ('owner', 'editor'));
create policy "canvas links: builders delete" on public.canvas_links
  for delete to authenticated using (public.project_role(project_id) in ('owner', 'editor'));

alter publication supabase_realtime add table public.canvas_links;
