import { after, NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { routeDeadline } from "@/lib/ai";
import { runStep, runStepKey } from "@/lib/plan-runner";

// One step per call: the answer goes back at once and the step builds after it, with the
// full time limit. The step starts the next one in a fresh call when it lands.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const deadline = routeDeadline(maxDuration);
  const { runId } = (await request.json().catch(() => ({}))) as {
    runId?: string;
  };
  if (!runId || !/^[0-9a-f-]{36}$/.test(runId))
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const given = Buffer.from(request.headers.get("x-realframe-key") ?? "");
  const expected = Buffer.from(runStepKey(runId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const origin = request.nextUrl.origin;
  after(() =>
    runStep(runId, origin, deadline).catch((e) =>
      console.error("plan step", e),
    ),
  );
  return NextResponse.json({ ok: true }, { status: 202 });
}
