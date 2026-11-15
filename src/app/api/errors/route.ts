import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordError } from "@/lib/errors";
import { allow, clientIp } from "@/lib/rate-limit";

/** Errors the error pages hit in the browser. At most 20 a minute from one address. */
export async function POST(request: NextRequest) {
  if (!(await allow(`errors:${clientIp(request)}`, 20, 60)))
    return NextResponse.json({ ok: false }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    digest?: string;
    path?: string;
    stack?: string;
  };
  if (!body.message && !body.digest)
    return NextResponse.json({ ok: false }, { status: 400 });
  const {
    data: { user },
  } = await (await createClient()).auth.getUser().catch(() => ({
    data: { user: null },
  }));
  await recordError({
    source: "client",
    message: String(body.message ?? ""),
    digest: body.digest ?? null,
    path: body.path ?? null,
    stack: body.stack ?? null,
    userId: user?.id ?? null,
  });
  return NextResponse.json({ ok: true });
}
