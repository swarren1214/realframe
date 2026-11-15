import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRun } from "@/lib/plan-runs";
import {
  STALE_STEP_MS,
  needsRestart,
  settleStopped,
  startRunStep,
} from "@/lib/plan-runner";

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

/**
 * Keep a planned build moving. Steps run on the server on their own; the page calls this when
 * a run has made no progress for a while, and the next step is started again if its hand-off
 * was lost. Harmless when the run is healthy: a step can only be taken once.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { id, runId } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error!;

  const run = await loadRun(runId, id, auth.user.id);
  if (!run)
    return NextResponse.json({ error: "Build not found." }, { status: 404 });
  if (run.status !== "running")
    return NextResponse.json({
      status: run.status,
      versionId: run.version_id,
    });
  if (!needsRestart(run))
    return NextResponse.json({ status: run.status, restarted: false });
  try {
    await startRunStep(run.id, request.nextUrl.origin);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't restart the build." },
      { status: 502 },
    );
  }
  return NextResponse.json({ status: run.status, restarted: true });
}

/**
 * Stop a run. Between steps it's settled here: finished steps are kept as a version. While a
 * step is building, the step is asked to stop and settles the run itself within a few seconds.
 */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id, runId } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const run = await loadRun(runId, id, auth.user.id);
  if (!run)
    return NextResponse.json({ error: "Build not found." }, { status: 404 });
  if (run.status !== "running")
    return NextResponse.json(
      {
        error: "This build has already finished.",
        status: run.status,
        versionId: run.version_id,
      },
      { status: 409 },
    );

  const admin = createAdminClient();
  // Always leave the flag: a step about to start (or finishing now) sees it and stops.
  await admin
    .from("build_runs")
    .update({ cancel_requested_at: new Date().toISOString() })
    .eq("id", run.id);

  // Between steps (or the step's call died): take the next step ourselves so no background
  // call starts it, then settle.
  const staleBefore = new Date(Date.now() - STALE_STEP_MS).toISOString();
  const { data: taken } = await admin
    .from("build_runs")
    .update({ running_step: run.next_step, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("status", "running")
    .eq("next_step", run.next_step)
    .or(`running_step.is.null,updated_at.lt.${staleBefore}`)
    .select("id");
  if (!taken?.length) return NextResponse.json({ stopping: true }, { status: 202 });

  const v = await settleStopped(run, run.next_step);
  return NextResponse.json(
    v ? { stopped: true, versionId: v.id, number: v.number } : { stopped: true },
  );
}
