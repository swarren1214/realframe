-- What each prototype is built for: device kinds, the device it opens on, and an orientation lock.
alter table public.projects
  add column devices jsonb not null default '{"kinds":["desktop","tablet","phone"],"default":null,"orientation":"both"}'::jsonb;
