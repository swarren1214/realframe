import { ApiError, json, readJson, requireRole, route } from "@/lib/api/v1";

const THREAD_SELECT =
  "id, version_id, x, y, status, created_at, guest_name, comments(id, thread_id, author_email, author_name, is_guest, body, created_at)";

// GET /v1/projects/:id/threads?versionId= → pinned comment threads, oldest first.
export const GET = route<{ id: string }>(
  async (request, { supabase }, { id }) => {
    await requireRole(supabase, id, [
      "owner",
      "editor",
      "commenter",
      "viewer",
      "public",
    ]);
    let query = supabase
      .from("comment_threads")
      .select(THREAD_SELECT)
      .eq("project_id", id)
      .order("created_at");
    const versionId = request.nextUrl.searchParams.get("versionId");
    if (versionId) query = query.eq("version_id", versionId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return json({ threads: data ?? [] });
  },
);

// POST /v1/projects/:id/threads { versionId, x, y, body } → a new pinned thread.
// x and y are fractions (0–1) of the prototype's full scroll width and height.
export const POST = route<{ id: string }>(
  async (request, { supabase }, { id }) => {
    await requireRole(supabase, id, ["owner", "editor", "commenter"]);
    const body = await readJson<{
      versionId: string;
      x: number;
      y: number;
      body: string;
    }>(request);
    const text = String(body.body ?? "").trim();
    const x = Number(body.x);
    const y = Number(body.y);
    if (!text) throw new ApiError(400, "Write a comment first.", "invalid");
    if (!body.versionId || !(x >= 0 && x <= 1 && y >= 0 && y <= 1))
      throw new ApiError(400, "Pick a spot on the prototype.", "invalid");
    const { data, error } = await supabase.rpc("create_thread", {
      p_project: id,
      p_version: body.versionId,
      p_x: x,
      p_y: y,
      p_body: text,
    });
    if (error) throw new ApiError(400, error.message, "invalid");
    return json({ threadId: data }, 201);
  },
);
