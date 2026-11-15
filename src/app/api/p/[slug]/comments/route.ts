import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestCookieName, verifyGuest } from "@/lib/guest";
import { allow, clientIp } from "@/lib/rate-limit";

// Guest comments on password-protected prototypes. JSON body:
//   { threadId, body }              → reply to a thread
//   { versionId, x, y, body }       → start a new pinned thread
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, published, access_mode, guest_comments")
    .eq("slug", slug)
    .maybeSingle();
  if (!project || !project.published || project.access_mode !== "password") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const guest = verifyGuest(request.cookies.get(guestCookieName(project.id))?.value, project.id);
  if (!guest) return NextResponse.json({ error: "Enter the password again." }, { status: 401 });
  if (!project.guest_comments) return NextResponse.json({ error: "Comments are turned off for guests." }, { status: 403 });
  // At most 20 comments a minute per guest (by name and address) on a prototype.
  if (!(await allow(`comment:${project.id}:${guest.name}:${clientIp(request)}`, 20, 60)))
    return NextResponse.json({ error: "That's a lot of comments at once. Wait a minute, then try again." }, { status: 429 });

  const input = (await request.json().catch(() => ({}))) as {
    threadId?: string;
    versionId?: string;
    x?: number;
    y?: number;
    body?: string;
  };
  const body = String(input.body ?? "").trim();
  if (!body || body.length > 5000) return NextResponse.json({ error: "Write a comment up to 5,000 characters." }, { status: 400 });

  let threadId = input.threadId ?? null;
  if (threadId) {
    const { data: t } = await admin.from("comment_threads").select("id").eq("id", threadId).eq("project_id", project.id).maybeSingle();
    if (!t) return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  } else {
    const x = Number(input.x);
    const y = Number(input.y);
    if (!input.versionId || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) {
      return NextResponse.json({ error: "Pick a spot on the prototype." }, { status: 400 });
    }
    const { data: v } = await admin.from("versions").select("id").eq("id", input.versionId).eq("project_id", project.id).maybeSingle();
    if (!v) return NextResponse.json({ error: "Version not found." }, { status: 404 });
    const { data: t, error } = await admin
      .from("comment_threads")
      .insert({ project_id: project.id, version_id: v.id, x, y, guest_name: guest.name })
      .select("id")
      .single();
    if (error || !t) return NextResponse.json({ error: error?.message ?? "Couldn't start the thread." }, { status: 500 });
    threadId = t.id;
  }

  const { error } = await admin.from("comments").insert({
    thread_id: threadId,
    project_id: project.id,
    author_id: null,
    author_email: "",
    author_name: guest.name,
    is_guest: true,
    body,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ threadId });
}
