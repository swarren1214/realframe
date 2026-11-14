import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeUserCode, readState, requireAppConfig, signState, userInstallations } from "@/lib/github/app";

// Where GitHub sends people after installing the app (or authorising it). We only link an
// installation to a Realframe account after GitHub confirms that person can access it.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const state = readState<{ uid: string; next: string; installationId?: number }>(params.get("state"));
  const next = state?.next && state.next.startsWith("/") && !state.next.startsWith("//") ? state.next : "/projects";
  const back = (error?: string) => {
    const url = new URL(next, origin);
    url.searchParams.set("import", "github");
    if (error) url.searchParams.set("github_error", error);
    return NextResponse.redirect(url);
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/?next=${encodeURIComponent(next)}`, origin));
  if (!state || state.uid !== user.id) return back("That GitHub link expired. Try connecting again.");

  const installationId = Number(params.get("installation_id") ?? state.installationId ?? 0) || null;
  const code = params.get("code");
  if (!code) {
    // Installed without authorising: ask GitHub who this is, carrying the installation along.
    const config = await requireAppConfig();
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", `${origin}/api/github/callback`);
    url.searchParams.set("state", signState({ uid: user.id, next, installationId }));
    return NextResponse.redirect(url);
  }

  try {
    const token = await exchangeUserCode(code);
    const installs = await userInstallations(token);
    const admin = createAdminClient();
    // Link every installation this person can access, so the dialog shows them all.
    for (const inst of installs) {
      await admin.from("github_installations").upsert(
        {
          id: inst.id,
          account_login: inst.account.login,
          account_type: inst.account.type,
          added_by: user.id,
          suspended_at: inst.suspended_at,
        },
        { onConflict: "id", ignoreDuplicates: false },
      );
      await admin
        .from("github_installation_users")
        .upsert({ installation_id: inst.id, user_id: user.id }, { onConflict: "installation_id,user_id" });
    }
    if (installationId && !installs.some((i) => i.id === installationId)) {
      return back("GitHub says you can't access that installation.");
    }
    return back();
  } catch (err) {
    return back(err instanceof Error ? err.message.slice(0, 160) : "GitHub didn't connect.");
  }
}
