import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishBuild } from "@/lib/builds";
import type { PlanStep } from "@/lib/plan";

export type BuildRun = {
  id: string;
  project_id: string;
  user_id: string;
  generation_id: string;
  base_version_id: string | null;
  prompt: string;
  steps: PlanStep[];
  references: unknown;
  next_step: number;
  running_step: number | null;
  working_html: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_micros: number;
  status: "running" | "succeeded" | "failed" | "cancelled";
  version_id: string | null;
  error: string | null;
  updated_at: string;
};

/** A run belonging to this user and project, or null. */
export async function loadRun(runId: string, projectId: string, userId: string) {
  const { data } = await createAdminClient()
    .from("build_runs")
    .select("*")
    .eq("id", runId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as BuildRun | null) ?? null;
}

export async function updateRun(id: string, patch: Partial<BuildRun>) {
  const { error } = await createAdminClient()
    .from("build_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("updateRun", error.message);
}

/** Short summary stored on the version (shown in the versions list). */
function versionSummary(steps: PlanStep[]) {
  const done = steps.filter((s) => s.status === "done");
  if (steps.length === 1) return done[0]?.summary ?? "Updated the prototype.";
  return `Built in ${done.length} step${done.length === 1 ? "" : "s"}: ${done
    .map((s) => s.title)
    .join("; ")}.`;
}

/** Longer summary posted to the chat, one line per step. */
function chatSummary(steps: PlanStep[], note?: string) {
  if (steps.length === 1 && !note)
    return steps[0].summary ?? "Updated the prototype.";
  const lines = steps.map((s, i) => {
    const mark = s.status === "done" ? "✓" : s.status === "failed" ? "✕" : "–";
    return `${mark} ${i + 1}. ${s.title}${s.summary ? ` — ${s.summary}` : ""}`;
  });
  return [note, ...lines].filter(Boolean).join("\n");
}

/**
 * Save the run's document as a version, settle the build's cost and post the summary.
 * Used when the last step lands, and when a run stops early with some steps done.
 */
export async function finalizeRun(
  supabase: SupabaseClient,
  run: BuildRun,
  opts: {
    html: string;
    steps: PlanStep[];
    userId: string;
    designSystemId: string | null;
    status: BuildRun["status"];
    note?: string;
    error?: string;
  },
) {
  const { data: version, error } = await supabase.rpc("create_version", {
    p_project: run.project_id,
    p_html: opts.html,
    p_prompt: run.prompt,
    p_summary: versionSummary(opts.steps),
    p_source: "ai",
  });
  if (error || !version)
    throw new Error(error?.message ?? "Could not save the version.");
  const v = version as { id: string; number: number };
  if (opts.designSystemId) {
    await createAdminClient()
      .from("versions")
      .update({ design_system_id: opts.designSystemId })
      .eq("id", v.id);
  }
  await finishBuild(run.generation_id, {
    ok: true,
    input: run.input_tokens,
    output: run.output_tokens,
    cost: run.cost_micros,
  });
  await supabase.from("messages").insert({
    project_id: run.project_id,
    role: "assistant",
    content: chatSummary(opts.steps, opts.note),
    version_id: v.id,
    created_by: opts.userId,
  });
  await updateRun(run.id, {
    steps: opts.steps,
    status: opts.status,
    version_id: v.id,
    running_step: null,
    working_html: null,
    ...(opts.error ? { error: opts.error } : {}),
  });
  return v;
}

/** End a run that produced nothing worth keeping: no charge, and say what went wrong. */
export async function failRun(
  supabase: SupabaseClient,
  run: BuildRun,
  opts: {
    steps: PlanStep[];
    userId: string;
    status: "failed" | "cancelled";
    message: string;
    usage?: { input: number; output: number };
  },
) {
  await finishBuild(run.generation_id, {
    ok: false,
    error: opts.message,
    ...(opts.usage ?? {}),
  });
  await supabase.from("messages").insert({
    project_id: run.project_id,
    role: "assistant",
    content: opts.message,
    created_by: opts.userId,
  });
  await updateRun(run.id, {
    steps: opts.steps,
    status: opts.status,
    running_step: null,
    working_html: null,
    error: opts.message,
  });
}
