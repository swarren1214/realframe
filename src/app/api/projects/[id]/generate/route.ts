import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePrototype } from "@/lib/ai";
import { finishBuild, limitResponse, loadBuildContext, readPrompt } from "@/lib/builds";

export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json({ error: "Only owners and editors can change this prototype." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { prompt?: string; baseVersionId?: string | null };
  const read = readPrompt(body);
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  const { prompt } = read;

  const { current, history } = await loadBuildContext(supabase, id, body.baseVersionId);

  // Reserve one build against the caller's plan before spending anything.
  const { data: claimId, error: claimError } = await supabase.rpc("claim_generation", { p_project: id });
  if (claimError || !claimId) return limitResponse(claimError?.message);

  await supabase.from("messages").insert({ project_id: id, role: "user", content: prompt, created_by: user.id });

  try {
    const result = await generatePrototype({ prompt, currentHtml: current?.html ?? null, history });
    const { data: version, error } = await supabase.rpc("create_version", {
      p_project: id,
      p_html: result.html,
      p_prompt: prompt,
      p_summary: result.summary,
      p_source: "ai",
    });
    if (error || !version) throw new Error(error?.message ?? "Could not save the version.");
    const v = version as { id: string; number: number };
    await finishBuild(claimId as string, { ok: true, input: result.usage.input, output: result.usage.output });
    await supabase.from("messages").insert({
      project_id: id,
      role: "assistant",
      content: result.summary,
      version_id: v.id,
      created_by: user.id,
    });
    return NextResponse.json({ versionId: v.id, number: v.number, summary: result.summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed.";
    await finishBuild(claimId as string, { ok: false });
    await supabase
      .from("messages")
      .insert({ project_id: id, role: "assistant", content: `That didn't work: ${message}`, created_by: user.id });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
