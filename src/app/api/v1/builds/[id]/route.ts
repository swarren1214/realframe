import { ApiError, json, route } from "@/lib/api/v1";

// GET /v1/builds/:id → { status: started | succeeded | failed, version?, error? }.
export const GET = route<{ id: string }>(async (_request, { supabase }, { id }) => {
  const { data: build } = await supabase
    .from("generations")
    .select("id, project_id, status, version_id, error, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!build) throw new ApiError(404, "Build not found.", "not_found");
  let version: { id: string; number: number; summary: string | null } | null = null;
  if (build.version_id) {
    const { data } = await supabase.from("versions").select("id, number, summary").eq("id", build.version_id).maybeSingle();
    version = data;
  }
  return json({
    id: build.id,
    projectId: build.project_id,
    status: build.status,
    error: build.error,
    version,
    createdAt: build.created_at,
  });
});
