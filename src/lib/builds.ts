import { deviceBrief, readSettings } from "@/lib/devices";
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { costMicros } from "@/lib/billing";

/** Turn a claim_generation error into the right HTTP response. */
export function limitResponse(message: string | undefined) {
  if (message?.includes("free_limit_reached")) {
    return NextResponse.json(
      {
        error:
          "You've used this month's free builds. Upgrade to Pro to keep building.",
        code: "free_limit",
      },
      { status: 402 },
    );
  }
  if (message?.includes("daily_limit_reached")) {
    return NextResponse.json(
      {
        error:
          "You've hit the daily safety limit for builds. It frees up on a rolling 24-hour basis.",
        code: "daily_limit",
      },
      { status: 429 },
    );
  }
  return NextResponse.json(
    { error: message ?? "Couldn't start the build." },
    { status: 500 },
  );
}

/** Record how a claimed build ended. Never throws: bookkeeping must not fail a build. */
export async function finishBuild(
  claimId: string,
  outcome:
    { ok: true; input: number | null; output: number | null } | { ok: false },
) {
  try {
    const { error } = await createAdminClient().rpc("finish_generation", {
      p_id: claimId,
      p_status: outcome.ok ? "succeeded" : "failed",
      p_input_tokens: outcome.ok ? outcome.input : null,
      p_output_tokens: outcome.ok ? outcome.output : null,
      p_cost_micros: outcome.ok ? costMicros(outcome.input, outcome.output) : 0,
    });
    if (error) console.error("finish_generation", error.message);
  } catch (e) {
    console.error("finish_generation", e);
  }
}

/** The version to build on plus recent chat history. */
export async function loadBuildContext(
  supabase: SupabaseClient,
  projectId: string,
  baseVersionId?: string | null,
) {
  let base = supabase
    .from("versions")
    .select("id, html, kind")
    .eq("project_id", projectId);
  base = baseVersionId
    ? base.eq("id", baseVersionId)
    : base.order("number", { ascending: false }).limit(1);
  const [{ data: baseRows }, { data: history }, { data: project }] =
    await Promise.all([
      base,
      supabase
        .from("messages")
        .select("role, content")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("projects")
        .select("devices")
        .eq("id", projectId)
        .maybeSingle(),
    ]);
  return {
    /** Extra direction for the model: the screens this prototype is built for. */
    context: deviceBrief(readSettings(project?.devices)),
    current:
      (baseRows?.[0] as
        { id: string; html: string; kind: "html" | "bundle" } | undefined) ??
      null,
    history: (
      (history ?? []) as { role: "user" | "assistant"; content: string }[]
    ).reverse(),
  };
}

export function readPrompt(body: { prompt?: unknown }) {
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return { error: "Describe what to build or change." };
  if (prompt.length > 4000)
    return { error: "Keep the prompt under 4,000 characters." };
  return { prompt };
}

export const IMPORTED_APP_MESSAGE =
  "Imported apps can't be changed with prompts yet. Import a new zip to add a version, or pick a generated version to build on.";
