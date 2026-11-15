import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { versionFromContentHost } from "@/lib/content";
import { withAgent } from "@/lib/agent";
import { ROOT_DOMAIN } from "@/lib/hosts";

// Serves the files of an imported app (a 'bundle' version) on its own content-domain origin.
// Reached only through the proxy's rewrite for content hosts; on any other host it 404s.

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  wasm: "application/wasm",
  pdf: "application/pdf",
};

const ext = (p: string) =>
  p.split("/").pop()!.split(".").slice(1).pop()?.toLowerCase() ?? "";

// `sandbox` gives every page an opaque origin, even opened directly in a tab, so the app's
// scripts can never read Realframe's .realframe.app cookies. No allow-same-origin, ever.
function policy() {
  return [
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
    `frame-ancestors https://${ROOT_DOMAIN} https://*.${ROOT_DOMAIN} http://localhost:3000`,
  ].join("; ");
}

function notFound(message = "Not found") {
  return new NextResponse(message, {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const versionId = versionFromContentHost(request.headers.get("host"));
  if (!versionId) return notFound();

  const admin = createAdminClient();
  const { data: version } = await admin
    .from("versions")
    .select("project_id, kind, bundle_id, bundle_pruned_at")
    .eq("id", versionId)
    .maybeSingle();
  if (!version || version.kind !== "bundle" || !version.bundle_id)
    return notFound("This app is no longer available.");
  if (version.bundle_pruned_at)
    return notFound(
      "This version's files were removed because it's more than 90 days old and not in use. Newer versions are still available.",
    );

  const { path = [] } = await params;
  let rel = path.map((s) => decodeURIComponent(s)).join("/");
  if (rel.split("/").some((s) => s === ".." || s === ".")) return notFound();
  if (!rel || rel.endsWith("/")) rel += "index.html";
  const base = `${version.project_id}/${version.bundle_id}/`;

  const storage = admin.storage.from("bundles");
  async function fetchFile(p: string) {
    const { data } = await storage.createSignedUrl(base + p, 60);
    if (!data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    return res.ok ? res : null;
  }

  let file = await fetchFile(rel);
  // Single-page apps: an unknown route without a file extension gets index.html.
  if (!file && !ext(rel)) {
    file =
      (await fetchFile(`${rel}/index.html`)) ?? (await fetchFile("index.html"));
    if (file) rel = "index.html";
  }
  if (!file) return notFound();

  const type = TYPES[ext(rel)] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "content-type": type,
    "content-security-policy": policy(),
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "access-control-allow-origin": "*",
  };

  if (type.startsWith("text/html")) {
    // Inject the Realframe agent (comment pins, routes, presence) and the storage stand-in.
    const html = withAgent(await file.text());
    return new NextResponse(html, {
      headers: { ...headers, "cache-control": "private, max-age=300" },
    });
  }
  // A version never changes, so its files can be cached for good.
  return new NextResponse(file.body, {
    headers: {
      ...headers,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

export const HEAD = GET;
