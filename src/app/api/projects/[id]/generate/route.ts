import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePrototype } from "@/lib/ai";

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
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "Describe what to build or change." }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ error: "Keep the prompt under 4,000 characters." }, { status: 400 });

  let base = supabase.from("versions").select("id, html").eq("project_id", id);
  base = body.baseVersionId ? base.eq("id", body.baseVersionId) : base.order("number", { ascending: false }).limit(1);
  const { data: baseRows } = await base;
  const current = baseRows?.[0] ?? null;

  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(8);

  await supabase.from("messages").insert({ project_id: id, role: "user", content: prompt, created_by: user.id });

  try {
    const result = await generatePrototype({
      prompt,
      currentHtml: current?.html ?? null,
      history: (history ?? []).reverse() as { role: "user" | "assistant"; content: string }[],
    });
    const { data: version, error } = await supabase.rpc("create_version", {
      p_project: id,
      p_html: result.html,
      p_prompt: prompt,
      p_summary: result.summary,
      p_source: "ai",
    });
    if (error || !version) throw new Error(error?.message ?? "Could not save the version.");
    const v = version as { id: string; number: number };
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
    await supabase
      .from("messages")
      .insert({ project_id: id, role: "assistant", content: `That didn't work: ${message}`, created_by: user.id });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
