import { json, readJson, route } from "@/lib/api/v1";
import { createProject } from "@/lib/services/projects";
import { loadTeams } from "@/lib/teams";

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
  const { data: rows, error } = await supabase
    .from("projects")
    .select("id, owner_id, name, slug, access_mode, published, live_version_id, updated_at, comment_threads(status)")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  const projects = (rows ?? []) as Row[];
  // Owner is known from the row; anything else (invited, or through a team) comes from project_role().
  const others = await Promise.all(
    projects
      .filter((p) => p.owner_id !== user.id)
      .map(async (p) => [p.id, (await supabase.rpc("project_role", { p: p.id })).data as string | null] as const),
  );
  const roles = new Map(others);
  const ids = projects.map((p) => p.id);
  const { data: versions } = ids.length
    ? await supabase.from("versions").select("id, project_id, number").in("project_id", ids).order("number", { ascending: false })
    : { data: [] as { id: string; project_id: string; number: number }[] };

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

// POST /v1/projects { name, teamId? } → a new, empty prototype owned by the caller,
// in the given team if they belong to it, else their personal team.
export const POST = route(async (request, { supabase, user }) => {
  const body = await readJson<{ name: string; teamId: string }>(request);
  const { teams, current } = await loadTeams(supabase, user.id);
  const team = teams.find((t) => t.id === body.teamId) ?? current;
  const project = await createProject(supabase, user.id, String(body.name ?? ""), team?.id ?? null);
  return json({ project }, 201);
});
