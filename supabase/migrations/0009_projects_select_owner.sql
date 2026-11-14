-- Creating a prototype returns the new row (insert ... returning), which is checked against the
-- select policy. project_role() looks the row up in a separate query and can't see it yet, so the
-- owner check has to read the row itself.
drop policy "projects: read with any role" on public.projects;
create policy "projects: read with any role" on public.projects
  for select to authenticated using (owner_id = auth.uid() or public.project_role(id) is not null);
