import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InboxList, type InboxItem } from "./InboxList";

export const dynamic = "force-dynamic";

const FILTERS = {
  all: null,
  comments: ["comment", "reply"],
  reviews: ["approved", "changes"],
  builds: ["build_done", "build_failed"],
} as const;

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?next=/inbox");
  const show = ((await searchParams).show ?? "all") as keyof typeof FILTERS;
  const kinds = FILTERS[show] ?? null;

  let q = supabase
    .from("notifications")
    .select(
      "id, kind, project_id, version_id, thread_id, actor_name, body, created_at, read_at, projects(name), versions(number)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (kinds) q = q.in("kind", [...kinds]);
  const { data } = await q;

  const items: InboxItem[] = (data ?? []).map((n) => {
    const project = n.projects as unknown as { name: string } | null;
    const version = n.versions as unknown as { number: number } | null;
    return {
      id: n.id,
      kind: n.kind,
      projectId: n.project_id,
      versionId: n.version_id,
      threadId: n.thread_id,
      actor: n.actor_name,
      body: n.body,
      createdAt: n.created_at,
      read: Boolean(n.read_at),
      projectName: project?.name ?? "A prototype",
      versionNumber: version?.number ?? null,
    };
  });

  return (
    <main className="mx-auto max-w-3xl px-2 pt-10">
      <InboxList items={items} show={show in FILTERS ? show : "all"} />
    </main>
  );
}
