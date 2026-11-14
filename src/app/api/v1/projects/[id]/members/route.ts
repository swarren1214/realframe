import { ApiError, json, readJson, requireRole, route } from "@/lib/api/v1";
import { inviteMember, removeMember, type MemberRole } from "@/lib/services/projects";

// GET /v1/projects/:id/members → owner only.
export const GET = route<{ id: string }>(async (_request, { supabase }, { id }) => {
  await requireRole(supabase, id, ["owner"]);
  const { data, error } = await supabase
    .from("project_members")
    .select("email, role, user_id, created_at")
    .eq("project_id", id)
    .order("created_at");
  if (error) throw new Error(error.message);
  return json({ members: data ?? [] });
});

// POST /v1/projects/:id/members { email, role } → invite (or change their role).
export const POST = route<{ id: string }>(async (request, { supabase, user }, { id }) => {
  await requireRole(supabase, id, ["owner"]);
  const body = await readJson<{ email: string; role: MemberRole }>(request);
  const email = await inviteMember(supabase, user.id, id, String(body.email ?? ""), (body.role ?? "commenter") as MemberRole);
  return json({ email, role: body.role ?? "commenter" }, 201);
});

// DELETE /v1/projects/:id/members?email= → remove someone.
export const DELETE = route<{ id: string }>(async (request, { supabase }, { id }) => {
  await requireRole(supabase, id, ["owner"]);
  const email = request.nextUrl.searchParams.get("email");
  if (!email) throw new ApiError(400, "Say who to remove.", "invalid");
  await removeMember(supabase, id, email.toLowerCase());
  return new Response(null, { status: 204 });
});
