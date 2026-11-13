import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/projects";
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  let target = ok ? next : `/?error=link`;
  if (ok) {
    // First sign-in: ask for a name before anything else.
    const { data: profile } = await supabase.from("profiles").select("onboarded_at").maybeSingle();
    if (profile && !profile.onboarded_at) target = `/welcome?next=${encodeURIComponent(next)}`;
  }
  return NextResponse.redirect(new URL(target, url.origin));
}
