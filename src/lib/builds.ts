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
  if (message?.includes("spend_cap_reached")) {
    return NextResponse.json(
      {
        error:
          "You've reached this period's spend cap. Raise it in Usage & billing to keep building.",
        code: "spend_cap",
      },
      { status: 402 },
    );
  }
  const busy = message?.match(/build_in_progress: ([^\n]+)/);
  if (busy) {
    const who = busy[1].trim();
    return NextResponse.json(
      {
        error:
          who === "you"
            ? "You already have a build running on this prototype, maybe in another tab. Wait for it to finish, then try again."
            : `${who} is building this prototype right now. Wait for their build to finish, then try again, so neither of you loses changes.`,
        code: "build_in_progress",
      },
      { status: 409 },
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
    | {
        ok: true;
        input: number | null;
        output: number | null;
        /** Pre-computed cost, for runs that mixed models (e.g. planner + builder). */
        cost?: number;
      }
    | {
        ok: false;
        error?: string;
        input?: number | null;
        output?: number | null;
      },
) {
  try {
    const { error } = await createAdminClient().rpc("finish_generation", {
      p_id: claimId,
      p_status: outcome.ok ? "succeeded" : "failed",
      p_input_tokens: outcome.input ?? null,
      p_output_tokens: outcome.output ?? null,
      p_cost_micros: outcome.ok
        ? (outcome.cost ?? costMicros(outcome.input, outcome.output))
        : 0,
    });
    if (error) console.error("finish_generation", error.message);
    if (!outcome.ok) {
      console.error("build failed", claimId, outcome.error, outcome.output);
      if (outcome.error)
        await createAdminClient()
          .from("generations")
          .update({ error: outcome.error.slice(0, 500) })
          .eq("id", claimId);
    }
    await notifyBuild(claimId, outcome.ok ? null : (outcome.error ?? null));
  } catch (e) {
    console.error("finish_generation", e);
  }
}

/** Builds that ran this long notify the person who started them; they may have left. */
const LONG_BUILD_MS = 90_000;

/**
 * Inbox entries for a finished build: the prototype's owner hears about builds
 * someone else ran, and anyone hears about their own long builds.
 */
async function notifyBuild(claimId: string, error: string | null) {
  const admin = createAdminClient();
  const { data: g } = await admin
    .from("generations")
    .select("user_id, project_id, created_at, version_id")
    .eq("id", claimId)
    .maybeSingle();
  if (!g?.project_id) return;
  const { data: project } = await admin
    .from("projects")
    .select("owner_id")
    .eq("id", g.project_id)
    .maybeSingle();
  const { data: who } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", g.user_id)
    .maybeSingle();
  const long = Date.now() - new Date(g.created_at).getTime() > LONG_BUILD_MS;
  const to = new Set<string>();
  if (project?.owner_id && project.owner_id !== g.user_id)
    to.add(project.owner_id);
  if (long) to.add(g.user_id);
  if (!to.size) return;
  await admin.from("notifications").insert(
    [...to].map((user_id) => ({
      user_id,
      kind: error ? "build_failed" : "build_done",
      project_id: g.project_id,
      version_id: error ? null : g.version_id,
      actor_name: who?.display_name || who?.email || null,
      body: error ? error.slice(0, 280) : null,
    })),
  );
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
