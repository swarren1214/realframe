import { readReferences, referenceBlocks } from "@/lib/references";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GenerationError, generatePrototype, routeDeadline } from "@/lib/ai";
import { costMicros } from "@/lib/billing";
import { loadBuildContext } from "@/lib/builds";
import { stepPrompt, type PlanStep } from "@/lib/plan";
import {
  failRun,
  finalizeRun,
  loadRun,
  updateRun,
  type BuildRun,
} from "@/lib/plan-runs";

// One step per request keeps each call well inside the function timeout.
export const maxDuration = 300;

// A step that's been "running" this long was abandoned (crashed or timed out).
const STALE_STEP_MS = 6 * 60 * 1000;

type Ctx = { params: Promise<{ id: string; runId: string }> };

async function authorize(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      error: NextResponse.json({ error: "Sign in first." }, { status: 401 }),
    } as const;
  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor")
    return {
      error: NextResponse.json(
        { error: "Only owners and editors can change this prototype." },
        { status: 403 },
      ),
    } as const;
  return { supabase, user } as const;
}

function notRunning(run: BuildRun) {
  return NextResponse.json(
    {
      error: "This build has already finished.",
      status: run.status,
      versionId: run.version_id,
    },
    { status: 409 },
  );
}

/** Build the run's next step. Body: { index } — the step the client expects to run. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id, runId } = await params;
  const deadline = routeDeadline(maxDuration);
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const run = await loadRun(runId, id, user.id);
  if (!run)
    return NextResponse.json({ error: "Build not found." }, { status: 404 });
  if (run.status !== "running") return notRunning(run);

  const body = (await request.json().catch(() => ({}))) as { index?: number };
  const index = run.next_step;
  if (typeof body.index === "number" && body.index !== index) {
    return NextResponse.json(
      { error: "Out of step with the build.", nextStep: index },
      { status: 409 },
    );
  }
  const steps: PlanStep[] = run.steps.map((s) => ({ ...s }));
  if (index >= steps.length) return notRunning(run);

  // Take the step. If another request already holds it (double submit), back off.
  const staleBefore = new Date(Date.now() - STALE_STEP_MS).toISOString();
  const { data: taken } = await createAdminClient()
    .from("build_runs")
    .update({ running_step: index, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("status", "running")
    .eq("next_step", index)
    .or(`running_step.is.null,updated_at.lt.${staleBefore}`)
    .select("id");
  if (!taken?.length)
    return NextResponse.json(
      { error: "This step is already being built." },
      { status: 409 },
    );

  const { current, history, context, designSystemId } = await loadBuildContext(
    supabase,
    id,
    run.base_version_id,
  );
  const currentHtml = run.working_html ?? current?.html ?? null;

  try {
    const references = await referenceBlocks(
      readReferences(run.references, run.project_id, run.user_id),
    );
    const result = await generatePrototype({
      prompt: stepPrompt(run.prompt, steps, index),
      references,
      context,
      currentHtml,
      history,
      deadline,
    });
    steps[index] = { ...steps[index], status: "done", summary: result.summary };
    const totals = {
      input_tokens: run.input_tokens + (result.usage.input ?? 0),
      output_tokens: run.output_tokens + (result.usage.output ?? 0),
      cost_micros:
        run.cost_micros + costMicros(result.usage.input, result.usage.output),
    };

    if (index === steps.length - 1) {
      const v = await finalizeRun(
        supabase,
        { ...run, ...totals },
        {
          html: result.html,
          steps,
          userId: user.id,
          designSystemId,
          status: "succeeded",
        },
      );
      return NextResponse.json({
        index,
        summary: result.summary,
        done: true,
        versionId: v.id,
        number: v.number,
      });
    }

    await updateRun(run.id, {
      ...totals,
      steps,
      working_html: result.html,
      next_step: index + 1,
      running_step: null,
    });
    return NextResponse.json({
      index,
      summary: result.summary,
      done: false,
      nextStep: index + 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed.";
    steps[index] = { ...steps[index], status: "failed" };
    // Earlier steps worked: keep that progress as a version rather than throwing it away.
    if (index > 0 && run.working_html) {
      try {
        const v = await finalizeRun(supabase, run, {
          html: run.working_html,
          steps,
          userId: user.id,
          designSystemId,
          status: "failed",
          note: `Finished ${index} of ${steps.length} steps. Step ${index + 1} didn't work (${message}), so I saved the progress so far. Ask again to pick up the rest.`,
          error: message,
        });
        return NextResponse.json(
          {
            error: message,
            index,
            partial: true,
            versionId: v.id,
            number: v.number,
          },
          { status: 500 },
        );
      } catch (saveErr) {
        console.error("finalizeRun (partial)", saveErr);
      }
    }
    await failRun(supabase, run, {
      steps,
      userId: user.id,
      status: "failed",
      message: `That didn't work: ${message}`,
      usage: err instanceof GenerationError ? err.usage : undefined,
    });
    return NextResponse.json({ error: message, index }, { status: 500 });
  }
}

/** Stop a run between steps. Finished steps are kept as a version. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id, runId } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const run = await loadRun(runId, id, user.id);
  if (!run)
    return NextResponse.json({ error: "Build not found." }, { status: 404 });
  if (run.status !== "running") return notRunning(run);
  if (run.running_step !== null) {
    const age = Date.now() - new Date(run.updated_at).getTime();
    if (age < STALE_STEP_MS)
      return NextResponse.json(
        { error: "A step is still building. Stop once it finishes." },
        { status: 409 },
      );
  }

  const done = run.next_step;
  if (done > 0 && run.working_html) {
    const { designSystemId } = await loadBuildContext(
      supabase,
      id,
      run.base_version_id,
    );
    const v = await finalizeRun(supabase, run, {
      html: run.working_html,
      steps: run.steps,
      userId: user.id,
      designSystemId,
      status: "cancelled",
      note: `Stopped after ${done} of ${run.steps.length} steps.`,
    });
    return NextResponse.json({
      stopped: true,
      versionId: v.id,
      number: v.number,
    });
  }
  await failRun(supabase, run, {
    steps: run.steps,
    userId: user.id,
    status: "cancelled",
    message: "Stopped before anything was built.",
  });
  return NextResponse.json({ stopped: true });
}
