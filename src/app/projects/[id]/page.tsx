import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Member, Message, Project, Role, Thread, VersionMeta } from "@/lib/types";
import { Studio } from "./Studio";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/?next=/projects/${id}`);

  const { data: project } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor") redirect(`/p/${project.slug}`);

  const [versions, messages, members, threads, latest, quota] = await Promise.all([
    supabase
      .from("versions")
      .select("id, number, summary, prompt, source, created_at")
      .eq("project_id", id)
      .order("number", { ascending: false }),
    supabase.from("messages").select("id, role, content, version_id, created_at").eq("project_id", id).order("created_at"),
    role === "owner"
      ? supabase.from("project_members").select("email, role, user_id, created_at").eq("project_id", id).order("created_at")
      : Promise.resolve({ data: [] as Member[] }),
    supabase
      .from("comment_threads")
      .select("id, version_id, x, y, status, created_at, comments(id, thread_id, author_email, author_name, body, created_at)")
      .eq("project_id", id)
      .order("created_at"),
    supabase.from("versions").select("id, html").eq("project_id", id).order("number", { ascending: false }).limit(1),
    supabase.rpc("generation_quota"),
  ]);
  const q = (quota.data as { daily_limit: number; used: number; remaining: number }[] | null)?.[0] ?? null;

  return (
    <Studio
      project={project as Project}
      role={role as Role}
      userEmail={user.email ?? ""}
      versions={(versions.data ?? []) as VersionMeta[]}
      messages={(messages.data ?? []) as Message[]}
      members={(members.data ?? []) as Member[]}
      threads={(threads.data ?? []) as Thread[]}
      initialHtml={latest.data?.[0]?.html ?? null}
      initialVersionId={latest.data?.[0]?.id ?? null}
      quota={q ? { limit: q.daily_limit, remaining: q.remaining } : null}
    />
  );
}
