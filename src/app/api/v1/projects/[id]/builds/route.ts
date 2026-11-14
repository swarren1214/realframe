import { after } from "next/server";
import { ApiError, json, readJson, requireRole, route } from "@/lib/api/v1";
import { generatePrototype } from "@/lib/ai";
import { IMPORTED_APP_MESSAGE, finishBuild, limitResponse, loadBuildContext, readPrompt } from "@/lib/builds";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// POST /v1/projects/:id/builds { prompt, baseVersionId? } → 202 { buildId }.
// The build runs after the response is sent, so a phone that goes to the background
// doesn't lose it. Poll GET /v1/builds/:buildId until status is "succeeded" or "failed".
export const POST = route<{ id: string }>(async (request, { supabase, user }, { id }) => {
  await requireRole(supabase, id, ["owner", "editor"]);
  const body = await readJson<{ prompt: string; baseVersionId: string | null }>(request);
  const read = readPrompt(body);
  if ("error" in read) throw new ApiError(400, read.error!, "invalid");
  const { prompt } = read;

  const { current, history } = await loadBuildContext(supabase, id, body.baseVersionId);
  if (current?.kind === "bundle") throw new ApiError(400, IMPORTED_APP_MESSAGE, "imported_app");

  const { data: claimId, error: claimError } = await supabase.rpc("claim_generation", { p_project: id });
  if (claimError || !claimId) return limitResponse(claimError?.message);
  const buildId = claimId as string;

  await supabase.from("messages").insert({ project_id: id, role: "user", content: prompt, created_by: user.id });

  after(async () => {
    const admin = createAdminClient();
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
      await admin.from("generations").update({ version_id: v.id }).eq("id", buildId);
      await finishBuild(buildId, { ok: true, input: result.usage.input, output: result.usage.output });
      await supabase
        .from("messages")
        .insert({ project_id: id, role: "assistant", content: result.summary, version_id: v.id, created_by: user.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed.";
      await admin.from("generations").update({ error: message }).eq("id", buildId);
      await finishBuild(buildId, { ok: false });
      await supabase
        .from("messages")
        .insert({ project_id: id, role: "assistant", content: `That didn't work: ${message}`, created_by: user.id });
    }
  });

  return json({ buildId, status: "started" }, 202);
});
