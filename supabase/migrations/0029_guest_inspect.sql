-- Dev mode on the review page. People invited to a prototype can always open it;
-- password guests and anyone with a public link only when the owner turns this on.
alter table public.projects
  add column guest_inspect boolean not null default false;
