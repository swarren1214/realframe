-- Native apps (iOS + Android): async builds the apps can poll, and push notification tokens.

-- Builds started from /api/v1 run in the background. The app polls the generation row,
-- so it records the version it produced and, on failure, a message to show.
alter table public.generations
  add column version_id uuid references public.versions(id) on delete set null,
  add column error text;

-- One row per signed-in device. Push is sent by a server-side function with the secret key.
create table public.device_tokens (
  token text primary key check (char_length(token) between 8 and 512),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  app_version text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;

create policy "device_tokens: read own" on public.device_tokens
  for select using (user_id = auth.uid());
create policy "device_tokens: add own" on public.device_tokens
  for insert with check (user_id = auth.uid());
create policy "device_tokens: update own" on public.device_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "device_tokens: delete own" on public.device_tokens
  for delete using (user_id = auth.uid());
