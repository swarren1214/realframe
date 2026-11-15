import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUILD_STALE_MS, appOrigin, startRunner } from "@/lib/builds/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A queued build nobody has started after this long was dropped by its caller. */
const QUEUED_STALE_MS = 3 * 60_000;

/**
 * Vercel Cron, every 5 minutes: tidies up work whose request never finished.
 * - Planned builds with no progress for 15 minutes, and builds still "started" after 15
 *   minutes, are settled in the database (sweep_stale_work).
 * - Repo builds still "building" after their function's limit are failed and their sandbox
 *   is stopped; the next queued build for that prototype is started.
 * - Queued repo builds that never started (their runner call was lost) are started.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: swept, error } = await admin.rpc("sweep_stale_work");
  if (error) console.error("sweep_stale_work", error.message);

  const now = Date.now();
  const { data: stuck } = await admin
    .from("builds")
    .update({
      status: "failed",
      error_summary:
        "The build ran out of time. Builds have about 11 minutes; try a lighter build command.",
      finished_at: new Date(now).toISOString(),
    })
    .eq("status", "building")
    .lt("started_at", new Date(now - BUILD_STALE_MS).toISOString())
    .select("id, project_id, sandbox_id");
  for (const b of stuck ?? []) {
    if (!b.sandbox_id) continue;
    const { Sandbox } = await import("@vercel/sandbox");
    await Sandbox.get({ name: b.sandbox_id })
      .then((s) => s.stop())
      .catch(() => {});
  }

  // Start the newest queued build of each prototype that has nothing building.
  const { data: queued } = await admin
    .from("builds")
    .select("id, project_id, queued_at")
    .eq("status", "queued")
    .lt("queued_at", new Date(now - QUEUED_STALE_MS).toISOString())
    .order("queued_at", { ascending: false })
    .limit(50);
  const projects = [...new Set((queued ?? []).map((q) => q.project_id))];
  const { data: busy } = projects.length
    ? await admin
        .from("builds")
        .select("project_id")
        .eq("status", "building")
        .in("project_id", projects)
    : { data: [] };
  const taken = new Set((busy ?? []).map((b) => b.project_id));
  let started = 0;
  for (const q of queued ?? []) {
    if (taken.has(q.project_id)) continue;
    taken.add(q.project_id);
    await startRunner(q.id, appOrigin())
      .then(() => started++)
      .catch((e) => console.error("sweep start", q.id, e));
  }

  // Housekeeping: 30 days of errors, a day of rate-limit windows.
  await Promise.all([
    admin
      .from("app_errors")
      .delete()
      .lt("created_at", new Date(now - 30 * 86_400_000).toISOString()),
    admin
      .from("rate_limits")
      .delete()
      .lt("window_start", new Date(now - 86_400_000).toISOString()),
  ]);

  return NextResponse.json({
    ...((swept as Record<string, number>[] | null)?.[0] ?? {}),
    repo_builds_failed: stuck?.length ?? 0,
    repo_builds_started: started,
    error: Boolean(error),
  });
}
