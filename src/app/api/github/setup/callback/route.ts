import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { convertManifest, getAppConfig, readState, saveAppConfig } from "@/lib/github/app";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = readState<{ uid: string; purpose: string }>(request.nextUrl.searchParams.get("state"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!code || !state || state.purpose !== "setup" || !user || user.id !== state.uid) {
    return new NextResponse("This setup link has expired. Start again from /api/github/setup.", { status: 400 });
  }
  if (await getAppConfig()) return NextResponse.redirect(new URL("/projects?github=ready", origin));
  const config = await convertManifest(code);
  await saveAppConfig(config);
  return NextResponse.redirect(new URL("/projects?github=ready", origin));
}
