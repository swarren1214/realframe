import { json, readJson, route } from "@/lib/api/v1";
import { createProject } from "@/lib/services/projects";

type Row = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  access_mode: string;
  published: boolean;
  live_version_id: string | null;
  updated_at: string;
  comment_threads: { status: string }[] | null;
};

// GET /v1/projects → every project the caller owns or was invited to, newest first.
export const GET = route(async (_request, { supabase, user }) => {
  const [{ data: rows, error }, { data: memberships }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, owner_id, name, slug, access_mode, published, live_version_id, updated_at, comment_threads(status)")
      .order("updated_at", { ascending: false }),
    supabase.from("project_members").select("project_id, role").eq("user_id", user.id),
  ]);
  if (error) throw new Error(error.message);
  const projects = (rows ?? []) as Row[];
  const ids = projects.map((p) => p.id);
  const { data: versions } = ids.length
    ? await supabase.from("versions").select("id, project_id, number").in("project_id", ids).order("number", { ascending: false })
    : { data: [] as { id: string; project_id: string; number: number }[] };

  const roles = new Map((memberships ?? []).map((m) => [m.project_id as string, m.role as string]));
  const latest = new Map<string, number>();
  const numbers = new Map<string, number>();
  for (const v of versions ?? []) {
    if (!latest.has(v.project_id)) latest.set(v.project_id, v.number);
    numbers.set(v.id, v.number);
  }

  return json({
    projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        role: p.owner_id === user.id ? "owner" : (roles.get(p.id) ?? "viewer"),
        accessMode: p.access_mode,
        published: p.published,
        liveVersion: p.live_version_id ? (numbers.get(p.live_version_id) ?? null) : null,
        latestVersion: latest.get(p.id) ?? null,
        openThreads: (p.comment_threads ?? []).filter((t) => t.status === "open").length,
        updatedAt: p.updated_at,
      })),
  });
});

// POST /v1/projects { name } → a new, empty prototype owned by the caller.
export const POST = route(async (request, { supabase, user }) => {
  const body = await readJson<{ name: string }>(request);
  const project = await createProject(supabase, user.id, String(body.name ?? ""));
  return json({ project }, 201);
});
