import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GenerationError, generatePrototype } from "@/lib/ai";
import { finishBuild, limitResponse, loadBuildContext } from "@/lib/builds";
import { snapshotBundle } from "@/lib/snapshot";

// Rendering the app, then rebuilding it, takes a while.
export const maxDuration = 300;

const COPY_PROMPT = (n: number, truncated: boolean) =>
  `Rebuild v${n} as an editable prototype. The current document is a static snapshot of an app that was built from code (from GitHub or an uploaded build): its rendered markup and the CSS rules it uses, with scripts removed${truncated ? " and the end cut off" : ""}. Recreate it as one self-contained, interactive prototype that looks the same: keep the layout, styles, colors, fonts and content, simplify the markup and CSS where it's generated or repetitive, and bring back the obvious interactions (navigation between screens, tabs, menus, forms) with small inline scripts.`;

/** Make a prompt-editable copy of an imported (bundle) version. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor")
    return NextResponse.json(
      { error: "Only owners and editors can change this prototype." },
      { status: 403 },
    );

  const body = (await request.json().catch(() => ({}))) as {
    versionId?: string;
  };
  const { data: source } = await supabase
    .from("versions")
    .select("id, number, kind")
    .eq("id", body.versionId ?? "")
    .eq("project_id", id)
    .maybeSingle();
  if (!source)
    return NextResponse.json({ error: "Version not found." }, { status: 404 });
  if (source.kind !== "bundle")
    return NextResponse.json(
      { error: "That version can already be changed with prompts." },
      { status: 400 },
    );

  const { data: claimId, error: claimError } = await supabase.rpc(
    "claim_generation",
    { p_project: id },
  );
  if (claimError || !claimId) return limitResponse(claimError?.message);

  await supabase.from("messages").insert({
    project_id: id,
    role: "user",
    content: `Make an AI-editable copy of v${source.number}`,
    created_by: user.id,
  });

  try {
    const snap = await snapshotBundle(source.id as string);
    if (snap.html.length < 200)
      throw new Error(
        "The app didn't render anything we could copy. It may need a sign-in or data it can't reach from our servers.",
      );
    const { context } = await loadBuildContext(supabase, id, null);
    const prompt = COPY_PROMPT(source.number as number, snap.truncated);
    const result = await generatePrototype({
      prompt,
      context,
      currentHtml: snap.html,
      history: [],
      timeBudgetSeconds: maxDuration - 40,
    });
    const { data: version, error } = await supabase.rpc("create_version", {
      p_project: id,
      p_html: result.html,
      p_prompt: `AI copy of v${source.number}`,
      p_summary: result.summary,
      p_source: "ai",
    });
    if (error || !version)
      throw new Error(error?.message ?? "Could not save the version.");
    const v = version as { id: string; number: number };
    await finishBuild(claimId as string, {
      ok: true,
      input: result.usage.input,
      output: result.usage.output,
    });
    await supabase.from("messages").insert({
      project_id: id,
      role: "assistant",
      content: `Made v${v.number}, an AI-editable copy of v${source.number}. Prompts now change this copy; later pushes still arrive as their own versions.\n\n${result.summary}`,
      version_id: v.id,
      created_by: user.id,
    });
    return NextResponse.json({ versionId: v.id, number: v.number });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The copy failed.";
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
