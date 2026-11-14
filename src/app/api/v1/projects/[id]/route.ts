import { ApiError, json, readJson, requireRole, route } from "@/lib/api/v1";
import { renameProject } from "@/lib/services/projects";

type Params = { id: string };

// GET /v1/projects/:id → the project, its versions (no HTML) and the prompt history.
export const GET = route<Params>(async (_request, { supabase }, { id }) => {
  const role = await requireRole(supabase, id, [
    "owner",
    "editor",
    "commenter",
    "viewer",
    "public",
  ]);
  const [{ data: project }, { data: versions }, { data: messages }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, name, slug, access_mode, published, live_version_id, has_password, guest_comments, updated_at",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("versions")
        .select("id, number, summary, prompt, source, kind, created_at")
        .eq("project_id", id)
        .order("number", { ascending: false }),
      role === "owner" || role === "editor"
        ? supabase
            .from("messages")
            .select("id, role, content, version_id, created_at")
            .eq("project_id", id)
            .order("created_at")
        : Promise.resolve({ data: [] }),
    ]);
  if (!project) throw new ApiError(404, "Project not found.", "not_found");
  return json({
    project,
    role,
    versions: versions ?? [],
    messages: messages ?? [],
  });
});

// PATCH /v1/projects/:id { name } → rename.
export const PATCH = route<Params>(async (request, { supabase }, { id }) => {
  await requireRole(supabase, id, ["owner", "editor"]);
  const body = await readJson<{ name: string }>(request);
  const name = await renameProject(supabase, id, String(body.name ?? ""));
  return json({ name });
});

// DELETE /v1/projects/:id → owner only.
export const DELETE = route<Params>(async (_request, { supabase }, { id }) => {
  await requireRole(supabase, id, ["owner"]);
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return new Response(null, { status: 204 });
});
