import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GenerationError, generatePrototype, routeDeadline } from "@/lib/ai";
import {
  IMPORTED_APP_MESSAGE,
  finishBuild,
  limitResponse,
  loadBuildContext,
} from "@/lib/builds";
import { MAX_FIX_THREADS, buildFixPrompt } from "@/lib/feedback";
import { markAddressed } from "@/lib/services/reviews";
import { reviewUrlFor } from "@/lib/hosts";

export const maxDuration = 300;

type ThreadRow = {
  id: string;
  x: number;
  y: number;
  status: string;
  guest_name: string | null;
  comments: {
    author_email: string;
    author_name: string | null;
    body: string;
    created_at: string;
  }[];
};

// POST { threadIds: string[], note?: string, baseVersionId?: string }
// One build whose instructions are the selected comment threads. On success the threads are
// marked addressed in the new version and their authors are emailed. A failed build bills nothing.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const deadline = routeDeadline(maxDuration);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor")
    return NextResponse.json(
      { error: "Only builders on this prototype can fix feedback." },
      { status: 403 },
    );

  const body = (await request.json().catch(() => ({}))) as {
    threadIds?: unknown;
    note?: unknown;
    baseVersionId?: string | null;
  };
  const threadIds = Array.isArray(body.threadIds)
    ? [...new Set(body.threadIds.map(String))]
    : [];
  if (threadIds.length === 0)
    return NextResponse.json(
      { error: "Pick at least one comment to fix." },
      { status: 400 },
    );
  if (threadIds.length > MAX_FIX_THREADS)
    return NextResponse.json(
      { error: `Fix up to ${MAX_FIX_THREADS} comments at a time.` },
      { status: 400 },
    );

  const { data: threads } = await supabase
    .from("comment_threads")
    .select(
      "id, x, y, status, guest_name, comments(author_email, author_name, body, created_at)",
    )
    .eq("project_id", id)
    .in("id", threadIds);
  const found = (threads ?? []) as ThreadRow[];
  if (found.length !== threadIds.length)
    return NextResponse.json(
      { error: "Some of those comments aren't on this prototype any more." },
      { status: 400 },
    );

  let prompt: string;
  try {
    prompt = buildFixPrompt(
      found.map((t) => ({
        id: t.id,
        x: t.x,
        y: t.y,
        comments: t.comments.map((c) => ({
          author: c.author_name || t.guest_name || c.author_email.split("@")[0],
          body: c.body,
          created_at: c.created_at,
        })),
      })),
      typeof body.note === "string" ? body.note : null,
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const { current, history, context, designSystemId } = await loadBuildContext(
    supabase,
    id,
    body.baseVersionId,
  );
  if (current?.kind === "bundle")
    return NextResponse.json({ error: IMPORTED_APP_MESSAGE }, { status: 400 });

  const { data: claimId, error: claimError } = await supabase.rpc(
    "claim_generation",
    { p_project: id, p_kind: "fix" },
  );
  if (claimError || !claimId) return limitResponse(claimError?.message);

  const label = `Fix ${found.length} comment${found.length === 1 ? "" : "s"} from feedback`;
  await supabase.from("messages").insert({
    project_id: id,
    role: "user",
    content: label,
    created_by: user.id,
  });

  try {
    const result = await generatePrototype({
      prompt,
      context,
      currentHtml: current?.html ?? null,
      history,
      deadline,
    });
    const { data: version, error } = await supabase.rpc("create_version", {
      p_project: id,
      p_html: result.html,
      p_prompt: label,
      p_summary: result.summary,
      p_source: "ai",
    });
    if (error || !version)
      throw new Error(error?.message ?? "Could not save the version.");
    const v = version as { id: string; number: number };
    if (designSystemId)
      await createAdminClient()
        .from("versions")
        .update({ design_system_id: designSystemId })
        .eq("id", v.id);
    await finishBuild(claimId as string, {
      ok: true,
      input: result.usage.input,
      output: result.usage.output,
    });
    await supabase.from("messages").insert({
      project_id: id,
      role: "assistant",
      content: result.summary,
      version_id: v.id,
      created_by: user.id,
    });
    const { data: project } = await supabase
      .from("projects")
      .select("slug")
      .eq("id", id)
      .single();
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host") ??
      "www.realframe.app";
    const notified = await markAddressed(supabase, {
      projectId: id,
      threadIds,
      version: v,
      builder: { id: user.id, email: user.email ?? "" },
      reviewUrl: reviewUrlFor(project?.slug ?? "", host),
    });
    return NextResponse.json({
      versionId: v.id,
      number: v.number,
      summary: result.summary,
      addressed: threadIds.length,
      notified,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed.";
    await finishBuild(claimId as string, {
      ok: false,
      error: message,
      ...(err instanceof GenerationError ? err.usage : {}),
    });
    await supabase.from("messages").insert({
      project_id: id,
      role: "assistant",
      content: `That didn't work: ${message}`,
      created_by: user.id,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
