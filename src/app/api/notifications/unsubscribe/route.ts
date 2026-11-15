import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validUnsubscribe } from "@/lib/notify-links";

const page = (title: string, body: string) =>
  new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="font-family:Inter,Arial,sans-serif;background:#fafaf9;color:#1c1917;display:grid;place-items:center;min-height:100vh;margin:0"><div style="max-width:380px;padding:28px;background:#fff;border:1px solid #e7e5e4;border-radius:24px;text-align:center"><h1 style="font-size:18px;margin:0 0 8px">${title}</h1><p style="font-size:14px;color:#57534e;margin:0 0 18px">${body}</p><a href="/welcome?edit=1#notifications" style="font-size:14px;font-weight:600;color:#be185d">Email settings</a></div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );

/** One-click unsubscribe from notification emails; the Inbox keeps working. */
export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!u || !validUnsubscribe(u, t))
    return page(
      "That link didn't work",
      "Change your email settings from your account instead.",
    );
  await createAdminClient()
    .from("profiles")
    .update({
      notify_email: { comments: false, reviews: false, builds: false },
    })
    .eq("id", u);
  return page(
    "You're unsubscribed",
    "You won't get notification emails. Everything still shows in your Inbox.",
  );
}
