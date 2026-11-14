import "server-only";
import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentUrlFor } from "@/lib/content";
import { defaultDevice, readSettings, screenSize } from "@/lib/devices";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Prototype thumbnails: a screenshot of each prototype's latest version, taken at the size of
 * the device it opens on. Captures run in /api/thumbnails/capture (it carries the headless
 * browser), started whenever the picker sees a thumbnail older than the latest version.
 */

export function thumbnailKey(projectId: string) {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "")
    .update(`thumbnails:${projectId}`)
    .digest("hex");
}

/** Asks the capture route to refresh these prototypes. Fire and forget. */
export async function requestThumbnails(projectIds: string[], origin: string) {
  await Promise.all(
    projectIds.map((id) =>
      fetch(`${origin}/api/thumbnails/capture`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-realframe-key": thumbnailKey(id),
        },
        body: JSON.stringify({ projectId: id }),
      }).catch((e) => console.error("thumbnail request", id, e)),
    ),
  );
}

type Card = {
  id: string;
  thumbnail_path: string | null;
  thumbnail_version_id: string | null;
  thumbnail_requested_at: string | null;
};

/**
 * For the picker: signed image URLs for the thumbnails that exist, and which prototypes have a
 * newer version than their thumbnail. Those are claimed (so two page loads don't both capture)
 * and returned for the caller to refresh after the response.
 */
export async function thumbnailsFor(
  supabase: SupabaseClient,
  projects: Card[],
) {
  const admin = createAdminClient();
  const ids = projects.map((p) => p.id);
  const urls: Record<string, string> = {};
  if (!ids.length)
    return { urls, stale: [] as string[], pending: [] as string[] };

  const withThumbs = projects.filter((p) => p.thumbnail_path);
  const [{ data: signed }, { data: latest }] = await Promise.all([
    withThumbs.length
      ? admin.storage.from("thumbnails").createSignedUrls(
          withThumbs.map((p) => p.thumbnail_path!),
          60 * 60,
        )
      : Promise.resolve({
          data: [] as { path: string | null; signedUrl: string }[],
        }),
    supabase.rpc("latest_versions", { p_ids: ids }),
  ]);
  for (const s of signed ?? []) {
    const p = withThumbs.find((x) => x.thumbnail_path === s.path);
    if (p && s.signedUrl) urls[p.id] = s.signedUrl;
  }

  const latestBy = new Map(
    ((latest ?? []) as { project_id: string; version_id: string }[]).map(
      (r) => [r.project_id, r.version_id],
    ),
  );
  const behind = projects.filter(
    (p) => latestBy.has(p.id) && latestBy.get(p.id) !== p.thumbnail_version_id,
  );
  // A capture claimed in the last two minutes is still running (or failed recently); leave it.
  const cutoff = Date.now() - 2 * 60_000;
  const claimable = behind
    .filter(
      (p) =>
        !p.thumbnail_requested_at ||
        new Date(p.thumbnail_requested_at).getTime() < cutoff,
    )
    .slice(0, 6);
  let stale: string[] = [];
  if (claimable.length) {
    const { data: claimed } = await admin
      .from("projects")
      .update({ thumbnail_requested_at: new Date().toISOString() })
      .in(
        "id",
        claimable.map((p) => p.id),
      )
      .or(
        `thumbnail_requested_at.is.null,thumbnail_requested_at.lt.${new Date(cutoff).toISOString()}`,
      )
      .select("id");
    stale = (claimed ?? []).map((r) => r.id as string);
  }
  return { urls, stale, pending: behind.map((p) => p.id) };
}

/** Where to load the version from, and at what size to shoot it. */
export async function captureTarget(projectId: string) {
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, devices")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;
  const { data: v } = await admin
    .from("versions")
    .select("id, html, kind")
    .eq("project_id", projectId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!v) return null;
  const settings = readSettings(project.devices);
  const device = defaultDevice(settings);
  const size =
    device.kind === "desktop"
      ? { width: 1280, height: 800 }
      : screenSize(
          device,
          settings.orientation === "landscape" ? "landscape" : "portrait",
        );
  return {
    versionId: v.id as string,
    kind: device.kind,
    size,
    html: v.kind === "bundle" ? null : (v.html as string),
    url: v.kind === "bundle" ? contentUrlFor(v.id as string) : null,
  };
}
