import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GUEST_MAX_AGE, guestCookieName, signGuest } from "@/lib/guest";
import { cookieDomain } from "@/lib/hosts";
import { allow, clientIp } from "@/lib/rate-limit";

// POST (form) { password, name } → sets the guest cookie for a password-protected prototype.
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("name") ?? "")
    .trim()
    .slice(0, 60);
  const back = String(form.get("back") ?? `/p/${slug}`);
  const backPath = back.startsWith("/") && !back.startsWith("//") ? back : `/p/${slug}`;
  const fail = (code: string) => {
    const url = new URL(backPath, request.url);
    url.searchParams.set("error", code);
    return NextResponse.redirect(url, 303);
  };

  if (!name) return fail("name");
  if (!password) return fail("password");

  // At most 10 tries per 10 minutes from one address, and 100 per prototype from everywhere.
  const ip = clientIp(request);
  const ok =
    (await allow(`unlock:${slug}:${ip}`, 10, 600)) &&
    (await allow(`unlock:${slug}`, 100, 600));
  if (!ok) return fail("rate");

  // Slow down guessing a little.
  await new Promise((r) => setTimeout(r, 400));
  const { data: projectId, error } = await createAdminClient().rpc("check_project_password", {
    p_slug: slug,
    p_password: password,
  });
  if (error || !projectId) return fail("password");

  const response = NextResponse.redirect(new URL(backPath, request.url), 303);
  const domain = cookieDomain(request.headers.get("host"));
  response.cookies.set(guestCookieName(projectId as string), signGuest(projectId as string, name), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_MAX_AGE,
    ...(domain ? { domain } : {}),
  });
  return response;
}
