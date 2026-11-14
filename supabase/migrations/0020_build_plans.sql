-- Planned builds: a big request is broken into ordered steps by a planner model, then
-- each step runs as its own request (so no single request outlives the function timeout).
-- The whole run is one build against the user's plan: one generations row, claimed when
-- the run starts and finished with the summed tokens and cost when the last step lands.
--
-- Rows are written only by the server (service role) after it has checked the caller.

create table public.build_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  base_version_id uuid references public.versions(id) on delete set null,
  prompt text not null,
  -- [{ "title": text, "detail": text, "status": "pending"|"done"|"failed", "summary": text|null }]
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  next_step int not null default 0,
  -- Set while a step is being built, so a double-submit can't run the same step twice.
  running_step int,
  -- The document as it stands after the last finished step.
  working_html text,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_micros bigint not null default 0,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  version_id uuid references public.versions(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index build_runs_project_idx on public.build_runs (project_id, created_at desc);
create index build_runs_running_idx on public.build_runs (status, updated_at) where status = 'running';
create index build_runs_user_idx on public.build_runs (user_id);
create index build_runs_generation_idx on public.build_runs (generation_id);

alter table public.build_runs enable row level security;

-- Users can see their own runs (e.g. to show progress after a reload). No client writes.
create policy "build_runs: read own" on public.build_runs
  for select using (user_id = (select auth.uid()));
