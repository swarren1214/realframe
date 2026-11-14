import { ApiError, json, readJson, route } from "@/lib/api/v1";

// POST /v1/threads/:id/comments { body } → a reply.
export const POST = route<{ id: string }>(async (request, { supabase, user }, { id }) => {
  const body = await readJson<{ body: string }>(request);
  const text = String(body.body ?? "").trim();
  if (!text) throw new ApiError(400, "Write a reply first.", "invalid");
  if (text.length > 5000) throw new ApiError(400, "Keep comments under 5,000 characters.", "invalid");
  const { data: thread } = await supabase.from("comment_threads").select("project_id").eq("id", id).maybeSingle();
  if (!thread) throw new ApiError(404, "Thread not found.", "not_found");
  const { data, error } = await supabase
    .from("comments")
    .insert({ thread_id: id, project_id: thread.project_id, author_id: user.id, author_email: user.email, body: text })
    .select("id, thread_id, author_email, author_name, body, created_at")
    .single();
  if (error) throw new ApiError(400, error.message, "invalid");
  return json({ comment: data }, 201);
});
