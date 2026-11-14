import { ApiError, json, readJson, route } from "@/lib/api/v1";

// PATCH /v1/threads/:id { status: "open" | "resolved" }
export const PATCH = route<{ id: string }>(async (request, { supabase }, { id }) => {
  const body = await readJson<{ status: string }>(request);
  if (body.status !== "open" && body.status !== "resolved") throw new ApiError(400, "Status must be open or resolved.", "invalid");
  const { data, error } = await supabase
    .from("comment_threads")
    .update({ status: body.status, resolved_at: body.status === "resolved" ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) throw new ApiError(400, error.message, "invalid");
  if (!data) throw new ApiError(404, "Thread not found.", "not_found");
  return json(data);
});
