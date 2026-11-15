-- Archived prototypes are offline and tucked away under the Archived filter.
alter table public.projects add column archived_at timestamptz;
