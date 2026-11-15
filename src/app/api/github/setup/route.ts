import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppConfig, signState } from "@/lib/github/app";

// One-time setup: creates Realframe's GitHub App through GitHub's manifest flow, so nobody
// has to copy keys around. Only Realframe's first account can run it, and only once.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/api/github/setup`, origin));

  const { data: firstId } = await createAdminClient().rpc("first_user_id");
  if (firstId !== user.id) return new NextResponse("Only the Realframe owner can set up GitHub.", { status: 403 });
  if (await getAppConfig()) return NextResponse.redirect(new URL("/projects?github=ready", origin));

  const org = request.nextUrl.searchParams.get("org");
  const manifest = {
    name: request.nextUrl.searchParams.get("name") || "Realframe",
    url: origin,
    description: "Build and share prototypes from your repositories.",
    public: true,
    hook_attributes: { url: `${origin}/api/github/webhook`, active: true },
    redirect_url: `${origin}/api/github/setup/callback`,
    callback_urls: [`${origin}/api/github/callback`],
    request_oauth_on_install: true,
    default_permissions: {
      contents: "write",
      pull_requests: "write",
      metadata: "read",
    },
    default_events: ["push"],
  };
  const action = org
    ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new`
    : "https://github.com/settings/apps/new";
  const state = signState({ uid: user.id, purpose: "setup" });
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Set up GitHub · Realframe</title>
<style>body{font:14px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fffbf7;color:#1c1917}
form{max-width:420px;padding:28px;border-radius:24px;background:#fff;border:1px solid #e7e5e4}
button{margin-top:12px;height:38px;padding:0 18px;border:0;border-radius:999px;background:#1c1917;color:#fff;font:600 13px system-ui;cursor:pointer}</style></head>
<body><form method="post" action="${esc(action)}?state=${esc(state)}">
<h1 style="margin:0 0 6px;font-size:18px">Create Realframe's GitHub App</h1>
<p style="margin:0;color:#57534e">GitHub will ask you to confirm. The app can only read repositories that people choose to share with it.</p>
<input type="hidden" name="manifest" value="${esc(JSON.stringify(manifest))}">
<button type="submit">Continue to GitHub</button></form></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
