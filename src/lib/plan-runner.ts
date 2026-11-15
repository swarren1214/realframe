import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readReferences, referenceBlocks } from "@/lib/references";
import { GenerationError, StoppedError, generatePrototype } from "@/lib/ai";
import { costMicros } from "@/lib/billing";
import { loadBuildContext } from "@/lib/builds";
import { stepPrompt, type PlanStep } from "@/lib/plan";
import {
  fixPrompt,
  needsFix,
  qaSummary,
  runQaChecks,
  type QaReport,
} from "@/lib/qa";
import {
  failRun,
  finalizeRun,
  updateRun,
  type BuildRun,
} from "@/lib/plan-runs";

/**
 * Planned builds run on the server. Each step runs in its own background function call
 * (POST /api/plan-runs/step, answered at once) with the full time limit, and starts the next
 * step when it lands. The page only watches the run, so closing it, locking the phone or a
 * dropped connection doesn't stop the build.
 *
 * If a hand-off is lost, the page (POST ./plan/[runId]) or the sweeper starts the step again.
 * Taking a step is a conditional update, so a step never runs twice.
 */

/** A step that's been "running" this long without progress was abandoned (crash or timeout). */
export const STALE_STEP_MS = 6 * 60 * 1000;
/** Between steps, a run with no progress for this long lost its hand-off. */
export const STALLED_HANDOFF_MS = 30 * 1000;

const PROGRESS_EVERY_MS = 1500;
const CANCEL_POLL_MS = 2000;

export function runStepKey(runId: string) {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "")
    .update(`plan-runs:${runId}`)
    .digest("hex");
}

/** Starts the run's next step in a fresh background call. Answers as soon as it's queued. */
export async function startRunStep(runId: string, origin: string) {
  const res = await fetch(`${origin}/api/plan-runs/step`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-realframe-key": runStepKey(runId),
      // Lets the call through Vercel's deployment protection on preview deployments.
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? {
            "x-vercel-protection-bypass":
              process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          }
        : {}),
    },
    body: JSON.stringify({ runId }),
  });
  if (!res.ok) throw new Error(`Couldn't start the next step (${res.status}).`);
}

/** Whether a running run needs its next step started again (its hand-off was lost). */
export function needsRestart(
  run: Pick<BuildRun, "status" | "running_step" | "updated_at">,
  now = Date.now(),
) {
  if (run.status !== "running") return false;
  const age = now - new Date(run.updated_at).getTime();
  return run.running_step === null
    ? age > STALLED_HANDOFF_MS
    : age > STALE_STEP_MS;
}

async function loadRunById(runId: string) {
  const { data } = await createAdminClient()
    .from("build_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  return (data as BuildRun | null) ?? null;
}

/** Take step `index` of a run. False if it's finished, or another call already holds it. */
async function takeStep(run: BuildRun, index: number) {
  const staleBefore = new Date(Date.now() - STALE_STEP_MS).toISOString();
  const { data } = await createAdminClient()
    .from("build_runs")
    .update({
      running_step: index,
      progress_chars: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "running")
    .eq("next_step", index)
    .or(`running_step.is.null,updated_at.lt.${staleBefore}`)
    .select("id");
  return Boolean(data?.length);
}

/**
 * Build the run's next step, then hand off to the step after it. Called in the background,
 * after the step request has been answered.
 */
export async function runStep(runId: string, origin: string, deadline: number) {
  const run = await loadRunById(runId);
  if (!run || run.status !== "running") return;
  const index = run.next_step;
  const steps: PlanStep[] = run.steps.map((s) => ({ ...s }));
  if (index >= steps.length) return;
  if (!(await takeStep(run, index))) return;

  // Stop was pressed while the previous step was finishing.
  if (run.cancel_requested_at) {
    await settleStopped(run, index);
    return;
  }

  const admin = createAdminClient();
  const { current, history, context, designSystemId } = await loadBuildContext(
    admin,
    run.project_id,
    run.base_version_id,
  );
  const currentHtml = run.working_html ?? current?.html ?? null;

  if (steps[index].kind === "qa") {
    await runQaStep({ run, index, steps, html: currentHtml, deadline, designSystemId, context, history });
    return;
  }

  // Stop: a flag on the run, checked every 2 seconds.
  const stop = new AbortController();
  const watch = setInterval(async () => {
    const { data } = await admin
      .from("build_runs")
      .select("cancel_requested_at")
      .eq("id", run.id)
      .maybeSingle();
    if (data?.cancel_requested_at) stop.abort();
  }, CANCEL_POLL_MS);

  // Progress for the page's checklist. Writing it also shows the step is alive.
  let lastProgress = 0;
  const progress = (chars: number) => {
    const now = Date.now();
    if (now - lastProgress < PROGRESS_EVERY_MS) return;
    lastProgress = now;
    void admin
      .from("build_runs")
      .update({ progress_chars: chars, updated_at: new Date(now).toISOString() })
      .eq("id", run.id)
      .eq("status", "running")
      .eq("running_step", index)
      .then(({ error }) => {
        if (error) console.error("plan progress", error.message);
      });
  };

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
      signal: stop.signal,
      onProgress: progress,
    });
    clearInterval(watch);
    steps[index] = { ...steps[index], status: "done", summary: result.summary };
    const totals = {
      input_tokens: run.input_tokens + (result.usage.input ?? 0),
      output_tokens: run.output_tokens + (result.usage.output ?? 0),
      cost_micros:
        run.cost_micros + costMicros(result.usage.input, result.usage.output),
    };

    if (index === steps.length - 1) {
      await finalizeRun(
        { ...run, ...totals },
        {
          html: result.html,
          steps,
          userId: run.user_id,
          designSystemId,
          status: "succeeded",
        },
      );
      return;
    }

    await updateRun(run.id, {
      ...totals,
      steps,
      working_html: result.html,
      next_step: index + 1,
      running_step: null,
      progress_chars: null,
    });
    // If this hand-off is lost, the page or the sweeper starts the step again.
    await startRunStep(run.id, origin).catch((e) =>
      console.error("plan hand-off", e),
    );
  } catch (err) {
    clearInterval(watch);
    if (err instanceof StoppedError) {
      await settleStopped(run, index, err.usage);
      return;
    }
    const message = err instanceof Error ? err.message : "Generation failed.";
    steps[index] = { ...steps[index], status: "failed" };
    // Earlier steps worked: keep that progress as a version rather than throwing it away.
    if (index > 0 && run.working_html) {
      try {
        await finalizeRun(run, {
          html: run.working_html,
          steps,
          userId: run.user_id,
          designSystemId,
          status: "failed",
          note: `Finished ${index} of ${steps.length} steps. Step ${index + 1} didn't work (${message}), so I saved the progress so far. Ask again to pick up the rest.`,
          error: message,
        });
        return;
      } catch (saveErr) {
        console.error("finalizeRun (partial)", saveErr);
      }
    }
    await failRun(run, {
      steps,
      userId: run.user_id,
      status: "failed",
      message: `That didn't work: ${message}`,
      usage: err instanceof GenerationError ? err.usage : undefined,
    });
  } finally {
    clearInterval(watch);
  }
}

/**
 * Settle a run that was stopped before or during step `index`: the steps finished before it
 * are kept as a version, and the step in progress isn't charged.
 */
export async function settleStopped(
  run: BuildRun,
  index: number,
  usage?: { input: number; output: number },
) {
  const steps: PlanStep[] = run.steps.map((s) => ({ ...s }));
  if (index > 0 && run.working_html) {
    const { designSystemId } = await loadBuildContext(
      createAdminClient(),
      run.project_id,
      run.base_version_id,
    );
    return finalizeRun(run, {
      html: run.working_html,
      steps,
      userId: run.user_id,
      designSystemId,
      status: "cancelled",
      note: `Stopped after ${index} of ${steps.length} steps. The finished steps are saved; the step in progress wasn't charged.`,
    });
  }
  await failRun(run, {
    steps,
    userId: run.user_id,
    status: "cancelled",
    message: "Stopped before anything was built. Nothing was charged.",
    usage,
  });
  return null;
}

/** Time the fix pass needs after the check, so the check's budget leaves room for it. */
const FIX_RESERVE_MS = 170_000;

/**
 * The build's last step: check the result in a real browser (lib/qa) and, if anything's
 * broken, have the model fix it once. The build is never lost here: if the checks can't run
 * or the fix doesn't work, the version is saved as built, with a note.
 */
async function runQaStep(opts: {
  run: BuildRun;
  index: number;
  steps: PlanStep[];
  html: string | null;
  deadline: number;
  designSystemId: string | null;
  context: string;
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const { run, index, steps, deadline, designSystemId } = opts;
  const admin = createAdminClient();
  const built = opts.html;
  if (!built) {
    await failRun(run, {
      steps,
      userId: run.user_id,
      status: "failed",
      message: "That didn't work: there was nothing to check.",
    });
    return;
  }

  const stop = new AbortController();
  const watch = setInterval(async () => {
    const { data } = await admin
      .from("build_runs")
      .select("cancel_requested_at")
      .eq("id", run.id)
      .maybeSingle();
    if (data?.cancel_requested_at) stop.abort();
  }, CANCEL_POLL_MS);

  let html = built;
  let totals = {
    input_tokens: run.input_tokens,
    output_tokens: run.output_tokens,
    cost_micros: run.cost_micros,
  };
  let summary: string;
  try {
    let report: QaReport | null = null;
    try {
      const budgetMs = Math.max(
        30_000,
        Math.min(75_000, deadline - Date.now() - FIX_RESERVE_MS - 45_000),
      );
      report = await runQaChecks(built, { budgetMs, signal: stop.signal });
      if (!report.ok) throw new Error(report.error ?? "The check stopped early.");
    } catch (err) {
      if (stop.signal.aborted) throw new StoppedError("Stopped.", { input: 0, output: 0 });
      console.error("qa checks", err);
      summary = "Couldn't run the automated check this time, so the prototype is saved as built.";
      report = null;
    }

    if (report && needsFix(report)) {
      try {
        const result = await generatePrototype({
          prompt: fixPrompt(run.prompt, report),
          references: [],
          context: opts.context,
          currentHtml: built,
          history: opts.history,
          deadline,
          signal: stop.signal,
          onProgress: () => {},
        });
        html = result.html;
        totals = {
          input_tokens: totals.input_tokens + (result.usage.input ?? 0),
          output_tokens: totals.output_tokens + (result.usage.output ?? 0),
          cost_micros:
            totals.cost_micros + costMicros(result.usage.input, result.usage.output),
        };
        summary = qaSummary(report, true);
      } catch (err) {
        if (err instanceof StoppedError) throw err;
        console.error("qa fix", err);
        summary = `${qaSummary(report, false)} Couldn't fix them automatically this time; ask in the chat and I'll take another pass.`;
      }
    } else if (report) {
      summary = qaSummary(report, false);
    }
  } catch (err) {
    clearInterval(watch);
    if (err instanceof StoppedError) {
      // Stopped during the check: keep the build as it was.
      await settleStopped({ ...run, working_html: built }, index, err.usage);
      return;
    }
    throw err;
  } finally {
    clearInterval(watch);
  }

  steps[index] = { ...steps[index], status: "done", summary: summary! };
  await finalizeRun(
    { ...run, ...totals },
    {
      html,
      steps,
      userId: run.user_id,
      designSystemId,
      status: "succeeded",
    },
  );
}
