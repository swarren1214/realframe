import { NextResponse, after, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppConfig } from "@/lib/github/app";
import { startRunner } from "@/lib/builds/run";
import { processImport } from "@/lib/design-systems/run";

// Design system syncs run after the response.
export const maxDuration = 300;

type PushEvent = {
  ref: string;
  after: string;
  deleted?: boolean;
  repository: { id: number; full_name: string };
  head_commit: {
    id: string;
    message: string;
    author?: { username?: string; name?: string };
  } | null;
  pusher?: { name?: string };
};

export async function POST(request: NextRequest) {
  const config = await getAppConfig();
  if (!config?.webhookSecret)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const raw = await request.text();
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", config.webhookSecret).update(raw).digest("hex")}`,
  );
  const given = Buffer.from(request.headers.get("x-hub-signature-256") ?? "");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  const body = JSON.parse(raw);
  const admin = createAdminClient();

  if (event === "installation" && body.action === "deleted") {
    await admin
      .from("github_installations")
      .delete()
      .eq("id", body.installation.id);
    return NextResponse.json({ ok: true });
  }
  if (
    event === "installation" &&
    (body.action === "suspend" || body.action === "unsuspend")
  ) {
    await admin
      .from("github_installations")
      .update({
        suspended_at:
          body.action === "suspend" ? new Date().toISOString() : null,
      })
      .eq("id", body.installation.id);
    return NextResponse.json({ ok: true });
  }
  if (event !== "push") return NextResponse.json({ ok: true, ignored: event });

  const push = body as PushEvent;
  if (push.deleted || !push.ref.startsWith("refs/heads/"))
    return NextResponse.json({ ok: true, ignored: "ref" });
  const branch = push.ref.slice("refs/heads/".length);

  const { data: sources } = await admin
    .from("project_sources")
    .select("project_id, repo_full_name, branch, projects(owner_id)")
    .eq("repo_id", push.repository.id)
    .eq("branch", branch)
    .eq("build_on_push", true);

  const started: string[] = [];
  for (const s of sources ?? []) {
    const owner =
      (s.projects as unknown as { owner_id: string } | null)?.owner_id ?? null;
    // A newer push replaces anything still waiting for this prototype.
    await admin
      .from("builds")
      .update({ status: "canceled", finished_at: new Date().toISOString() })
      .eq("project_id", s.project_id)
      .eq("status", "queued");
    const { data: build } = await admin
      .from("builds")
      .insert({
        project_id: s.project_id,
        requested_by: null,
        billed_to: owner,
        repo_full_name: push.repository.full_name,
        branch,
        commit_sha: push.after,
        commit_message:
          push.head_commit?.message.split("\n")[0].slice(0, 200) ?? null,
        commit_author:
          push.head_commit?.author?.username ??
          push.head_commit?.author?.name ??
          push.pusher?.name ??
          null,
        trigger: "push",
      })
      .select("id")
      .single();
    if (!build) continue;
    // One build per prototype at a time: if one is running, this one starts when it finishes.
    const { count } = await admin
      .from("builds")
      .select("id", { count: "exact", head: true })
      .eq("project_id", s.project_id)
      .eq("status", "building");
    if (!count) {
      await startRunner(build.id, request.nextUrl.origin).catch(() => {});
      started.push(build.id);
    }
  }
  // Design systems that follow this branch re-read the repository.
  const { data: systems } = await admin
    .from("design_systems")
    .select("id, source, status")
    .eq("source_kind", "github")
    .eq("sync_on_push", true)
    .eq("source->>repo", push.repository.full_name)
    .eq("source->>branch", branch);
  const syncing = (systems ?? [])
    .filter((d) => d.status !== "importing")
    .map((d) => d.id as string);
  if (syncing.length) {
    await admin
      .from("design_systems")
      .update({ status: "importing", progress: "Starting", error: null })
      .in("id", syncing);
    after(async () => {
      for (const id of syncing) await processImport(id);
    });
  }

  return NextResponse.json({
    ok: true,
    queued: sources?.length ?? 0,
    started: started.length,
    designSystems: syncing.length,
  });
}
