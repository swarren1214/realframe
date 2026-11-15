import { readReferences } from "@/lib/references";
import { NextResponse, type NextRequest } from "next/server";
import {
  messageWithPointed,
  promptWithPointed,
  readPointed,
} from "@/lib/pointing";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { qaStep, respondOrPlan } from "@/lib/plan";
import { qaEnabled } from "@/lib/qa";
import { startRunStep } from "@/lib/plan-runner";
import {
  IMPORTED_APP_MESSAGE,
  finishBuild,
  limitResponse,
  loadBuildContext,
  readPrompt,
} from "@/lib/builds";

export const maxDuration = 60;

/**
 * A chat message. One fast model call decides: answer it (questions, ideas, discussion: no
 * build is used and nothing changes), or plan a build. For a build: claim one, break the
 * request into ordered steps, start the first step on the server and return the steps. The steps run in the background, one after
 * another (see lib/plan-runner); the page watches the run's row for progress.
 */
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
  if (role !== "owner" && role !== "editor") {
    return NextResponse.json(
      { error: "Only owners and editors can change this prototype." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    baseVersionId?: string | null;
    smaller?: boolean;
    targets?: unknown;
    references?: unknown;
  };
  const read = readPrompt(body);
  if ("error" in read)
    return NextResponse.json({ error: read.error }, { status: 400 });
  const { prompt } = read;
  const targets = readPointed(body.targets);
  const references = readReferences(body.references, id, user.id);

  const { current, context, history } = await loadBuildContext(
    supabase,
    id,
    body.baseVersionId,
  );
  if (current?.kind === "bundle")
    return NextResponse.json({ error: IMPORTED_APP_MESSAGE }, { status: 400 });

  const asked = references.length
      ? `${promptWithPointed(prompt, targets)}\n\n(The person attached ${references.length} reference ${references.length === 1 ? "image" : "images"}; every step will see ${references.length === 1 ? "it" : "them"}.)`
      : promptWithPointed(prompt, targets);
  const decision = await respondOrPlan({
    prompt: asked,
    focused: targets.length > 0,
    context,
    history,
    currentHtml: current?.html ?? null,
    smaller: body.smaller === true,
  });

  const userMessage = {
    project_id: id,
    role: "user",
    content: messageWithPointed(prompt, targets),
    created_by: user.id,
    attachments: references,
  };

  // An answer: nothing is built, and no build is used.
  if (decision.kind === "reply") {
    await supabase.from("messages").insert(userMessage);
    await createAdminClient().from("messages").insert({
      project_id: id,
      role: "assistant",
      content: decision.text,
      created_by: user.id,
    });
    return NextResponse.json({ reply: decision.text });
  }
  const { usage } = decision;
  // Every build ends by checking the result in a browser and fixing what breaks.
  const steps = qaEnabled() ? [...decision.steps, qaStep()] : decision.steps;

  // The whole run is one build against the caller's plan.
  const { data: claimId, error: claimError } = await supabase.rpc(
    "claim_generation",
    { p_project: id },
  );
  if (claimError || !claimId) return limitResponse(claimError?.message);

  await supabase.from("messages").insert(userMessage);

  const { data: run, error } = await createAdminClient()
    .from("build_runs")
    .insert({
      project_id: id,
      user_id: user.id,
      generation_id: claimId as string,
      base_version_id: current?.id ?? null,
      // When the message leans on the chat ("yes, do that"), the run gets the restated request.
      prompt: decision.request === asked ? prompt : decision.request,
      steps,
      references,
      input_tokens: usage.input,
      output_tokens: usage.output,
      cost_micros: usage.costMicros,
    })
    .select("id")
    .single();
  if (error || !run) {
    await finishBuild(claimId as string, { ok: false });
    return NextResponse.json(
      { error: error?.message ?? "Couldn't start the build." },
      { status: 500 },
    );
  }

  const runId = (run as { id: string }).id;
  // If this call is lost, the page asks for the step again (POST ./plan/[runId]).
  await startRunStep(runId, request.nextUrl.origin).catch((e) =>
    console.error("plan start", e),
  );

  return NextResponse.json({
    runId,
    steps: steps.map((s) => ({ title: s.title })),
  });
}
