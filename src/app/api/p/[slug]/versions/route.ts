import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestCookieName, verifyGuest } from "@/lib/guest";
import { contentUrlFor } from "@/lib/content";

type Row = {
  id: string;
  number: number;
  html: string;
  kind: "html" | "bundle";
  summary: string | null;
  created_at: string;
};

/**
 * Versions a reviewer can compare: the live one and everything before it,
 * never drafts newer than what was shared. GET ?v=<id> returns one version's
 * content; without it, the list.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const admin = createAdminClient();
  const supabase = await createClient();

  // Who's asking: a signed-in person with a role on the prototype, or a guest
  // who entered the link's password.
  let projectId: string | null = null;
  let liveId: string | null = null;
  const { data: visible } = await supabase
    .from("projects")
    .select("id, live_version_id, published")
    .eq("slug", slug)
    .maybeSingle();
  if (visible) {
    const { data: role } = await supabase.rpc("project_role", { p: visible.id });
    const builder = role === "owner" || role === "editor";
    if (!role || role === "public" || (!visible.published && !builder))
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    projectId = visible.id;
    liveId = visible.live_version_id;
  } else {
    const { data: locked } = await admin
      .from("projects")
      .select("id, live_version_id")
      .eq("slug", slug)
      .eq("published", true)
      .eq("access_mode", "password")
      .maybeSingle();
    const guest =
      locked &&
      verifyGuest((await cookies()).get(guestCookieName(locked.id))?.value, locked.id);
    if (!locked || !guest)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    projectId = locked.id;
    liveId = locked.live_version_id;
  }
  if (!liveId) return NextResponse.json({ versions: [] });

  const { data: live } = await admin
    .from("versions")
    .select("number")
    .eq("id", liveId)
    .single();
  const ceiling = live?.number ?? 0;

  const id = new URL(request.url).searchParams.get("v");
  if (!id) {
    const { data } = await admin
      .from("versions")
      .select("id, number, summary, created_at")
      .eq("project_id", projectId)
      .lte("number", ceiling)
      .order("number", { ascending: false })
      .limit(50);
    return NextResponse.json({ versions: data ?? [] });
  }

  const { data: v } = await admin
    .from("versions")
    .select("id, number, html, kind, summary, created_at")
    .eq("project_id", projectId)
    .eq("id", id)
    .lte("number", ceiling)
    .maybeSingle();
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = v as Row;
  return NextResponse.json({
    id: row.id,
    number: row.number,
    summary: row.summary,
    html: row.kind === "bundle" ? null : row.html,
    src: row.kind === "bundle" ? contentUrlFor(row.id) : null,
  });
}
