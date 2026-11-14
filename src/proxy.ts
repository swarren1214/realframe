import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { APP_HOST, cookieDomain, isContentHost, subdomainSlug } from "@/lib/hosts";

// 1. Prototype subdomains: <slug>.realframe.app serves that prototype's review page.
// 2. Refreshes the Supabase session cookie on every request (shared across subdomains).
const STATIC_FILE = /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i;

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host");

  // 3. Imported apps: every path on a content host is served by the content route. No session here.
  if (isContentHost(host)) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/content${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }
  if (STATIC_FILE.test(request.nextUrl.pathname)) return NextResponse.next();

  const slug = subdomainSlug(host);
  const path = request.nextUrl.pathname;

  if (slug) {
    const passThrough = path.startsWith("/api/") || path.startsWith("/auth/") || path.startsWith("/p/") || path.startsWith("/_next/");
    if (!passThrough) {
      if (path === "/") {
        const url = request.nextUrl.clone();
        url.pathname = `/p/${slug}`;
        return withSession(request, NextResponse.rewrite(url, { request }), host);
      }
      // Anything else belongs to the main app.
      return NextResponse.redirect(new URL(`${path}${request.nextUrl.search}`, `https://${APP_HOST}`));
    }
  }
  return withSession(request, NextResponse.next({ request }), host);
}

async function withSession(request: NextRequest, initial: NextResponse, host: string | null) {
  let response = initial;
  const domain = cookieDomain(host);
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: domain ? { domain } : undefined,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // Recreate the response so refreshed cookies reach both the page and the browser.
        const rewritten = initial.headers.get("x-middleware-rewrite");
        response = rewritten ? NextResponse.rewrite(new URL(rewritten), { request }) : NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Images are matched too, so imported apps on the content domain can serve them.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
