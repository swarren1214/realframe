import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Member, Message, Project, Role, Thread, Variant, VersionMeta } from "@/lib/types";
import { Studio } from "./Studio";
import { AccountMenu } from "@/components/AccountMenu";

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

  const [versions, messages, members, threads, latest, quota, pending] = await Promise.all([
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
    supabase
      .from("variants")
      .select("id, group_id, position, prompt, summary, html, created_at")
      .eq("project_id", id)
      .is("kept_version_id", null)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);
  // Only the most recent group of unkept variants is shown for comparison.
  const pendingRows = (pending.data ?? []) as Variant[];
  const variants = pendingRows.filter((v) => v.group_id === pendingRows[0]?.group_id).sort((a, b) => a.position - b.position);
  const q = (quota.data as { plan: "free" | "pro"; build_limit: number; remaining: number }[] | null)?.[0] ?? null;

  return (
    <Studio
      accountMenu={<AccountMenu compact />}
      project={project as Project}
      role={role as Role}
      userEmail={user.email ?? ""}
      versions={(versions.data ?? []) as VersionMeta[]}
      messages={(messages.data ?? []) as Message[]}
      members={(members.data ?? []) as Member[]}
      threads={(threads.data ?? []) as Thread[]}
      initialHtml={latest.data?.[0]?.html ?? null}
      initialVersionId={latest.data?.[0]?.id ?? null}
      quota={q ? { plan: q.plan, limit: q.build_limit, remaining: q.remaining } : null}
      variants={variants}
    />
  );
}
