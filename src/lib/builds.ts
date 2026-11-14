import { deviceBrief, readSettings } from "@/lib/devices";
import { MAX_PROMPT } from "@/lib/prompt-shared";
import { designSystemBrief } from "@/lib/design-systems/brief";
import {
  DS_COLUMNS,
  type DesignSystem,
  type Rule,
} from "@/lib/design-systems/types";
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
        .select("devices, design_system_id")
        .eq("id", projectId)
        .maybeSingle(),
    ]);
  let dsBrief = "";
  let designSystemId: string | null = null;
  if (project?.design_system_id) {
    const [{ data: ds }, { data: rules }] = await Promise.all([
      supabase
        .from("design_systems")
        .select(DS_COLUMNS)
        .eq("id", project.design_system_id)
        .not("synced_at", "is", null)
        .maybeSingle(),
      supabase
        .from("design_system_rules")
        .select("*")
        .eq("design_system_id", project.design_system_id)
        .eq("status", "active")
        .order("created_at"),
    ]);
    if (ds) {
      dsBrief = designSystemBrief(
        ds as unknown as DesignSystem,
        (rules ?? []) as Rule[],
      );
      designSystemId = (ds as unknown as DesignSystem).id;
    }
  }
  return {
    /** Extra direction for the model: target screens and the team's design system. */
    context: [deviceBrief(readSettings(project?.devices)), dsBrief]
      .filter(Boolean)
      .join("\n\n"),
    designSystemId,
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
  if (prompt.length > MAX_PROMPT)
    return {
      error: `Keep the prompt under ${MAX_PROMPT.toLocaleString("en-US")} characters.`,
    };
  return { prompt };
}

export const IMPORTED_APP_MESSAGE =
  "Imported apps can't be changed with prompts yet. Import a new zip to add a version, or pick a generated version to build on.";
