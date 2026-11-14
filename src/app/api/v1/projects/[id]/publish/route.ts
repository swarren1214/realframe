import { ApiError, json, readJson, requireRole, route } from "@/lib/api/v1";
import { publishVersion, unpublish } from "@/lib/services/projects";

// POST /v1/projects/:id/publish { versionId } → make that version live at its review link.
export const POST = route<{ id: string }>(async (request, { supabase }, { id }) => {
  await requireRole(supabase, id, ["owner", "editor"]);
  const body = await readJson<{ versionId: string }>(request);
  if (!body.versionId) throw new ApiError(400, "Pick a version to publish.", "invalid");
  await publishVersion(supabase, id, body.versionId);
  return json({ published: true, liveVersionId: body.versionId });
});

// DELETE /v1/projects/:id/publish → take the review link down.
export const DELETE = route<{ id: string }>(async (_request, { supabase }, { id }) => {
  await requireRole(supabase, id, ["owner", "editor"]);
  await unpublish(supabase, id);
  return json({ published: false });
});
