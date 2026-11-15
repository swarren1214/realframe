import { NextResponse, after, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureTarget, thumbnailKey } from "@/lib/thumbnails";
import { browser, privateHost } from "@/lib/headless";

// Launching Chromium and letting a prototype settle takes a few seconds.
export const maxDuration = 60;

function authorized(req: NextRequest, projectId: string) {
  const given = Buffer.from(req.headers.get("x-realframe-key") ?? "");
  const expected = Buffer.from(thumbnailKey(projectId));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function capture(projectId: string) {
  const admin = createAdminClient();
  const target = await captureTarget(projectId);
  if (!target) return;
  const b = await browser();
  try {
    const page = await b.newPage();
    // Shoot at half the CSS size for desktops (crisp enough for a card, a fraction of the bytes).
    await page.setViewport({
      ...target.size,
      deviceScaleFactor: target.kind === "desktop" ? 0.5 : 1,
    });
    await page.setRequestInterception(true);
    page.on("request", (r) =>
      privateHost(r.url()) ? r.abort() : r.continue(),
    );
    // Prototypes can't use storage or dialogs in Realframe either.
    await page.evaluateOnNewDocument(() => {
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => null;
    });
    if (target.url)
      await page
        .goto(target.url, { waitUntil: "networkidle2", timeout: 20_000 })
        .catch(() => {});
    else {
      await page
        .setContent(target.html ?? "", { waitUntil: "load", timeout: 20_000 })
        .catch(() => {});
      await page
        .waitForNetworkIdle({ idleTime: 500, timeout: 8_000 })
        .catch(() => {});
    }
    // Fonts, CDN styles and first-render animations.
    await new Promise((r) => setTimeout(r, 1200));
    const shot = await page.screenshot({ type: "jpeg", quality: 72 });
    const path = `${projectId}/${target.versionId}.jpg`;
    const { error } = await admin.storage
      .from("thumbnails")
      .upload(path, Buffer.from(shot), {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });
    if (error) throw error;
    const { data: old } = await admin
      .from("projects")
      .select("thumbnail_path")
      .eq("id", projectId)
      .maybeSingle();
    await admin
      .from("projects")
      .update({
        thumbnail_path: path,
        thumbnail_version_id: target.versionId,
        thumbnail_requested_at: null,
      })
      .eq("id", projectId);
    if (old?.thumbnail_path && old.thumbnail_path !== path)
      await admin.storage.from("thumbnails").remove([old.thumbnail_path]);
  } finally {
    await b.close();
  }
}

export async function POST(req: NextRequest) {
  const { projectId } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
  };
  if (!projectId || !authorized(req, projectId))
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  after(() =>
    capture(projectId).catch((e) => {
      console.error("thumbnail capture failed", projectId, e);
    }),
  );
  return NextResponse.json({ ok: true });
}
