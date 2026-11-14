import { after, NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runBuild, runnerKey } from "@/lib/builds/run";

// Builds can take a while: the response returns at once and the build runs after it.
export const maxDuration = 800;

export async function POST(request: NextRequest) {
  const { buildId } = (await request.json().catch(() => ({}))) as { buildId?: string };
  if (!buildId || !/^[0-9a-f-]{36}$/.test(buildId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const given = Buffer.from(request.headers.get("x-realframe-key") ?? "");
  const expected = Buffer.from(runnerKey(buildId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  after(() => runBuild(buildId));
  return NextResponse.json({ ok: true }, { status: 202 });
}
