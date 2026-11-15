import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestCookieName, verifyGuest } from "@/lib/guest";
import { REVIEW_THREAD_SELECT, threadStamp } from "@/lib/threads";

/**
 * Comment threads for guests on a password-protected prototype, who have no session for live
 * updates. GET ?stamp=<last stamp> answers { stamp, unchanged: true } when nothing changed (two
 * tiny queries), and { stamp, threads } when something did.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .eq("published", true)
    .eq("access_mode", "password")
    .maybeSingle();
  const guest =
    project &&
    verifyGuest(
      (await cookies()).get(guestCookieName(project.id))?.value,
      project.id,
    );
  if (!project || !guest)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: threads }, latest] = await Promise.all([
    admin.from("comment_threads").select("status").eq("project_id", project.id),
    admin
      .from("comments")
      .select("created_at", { count: "exact" })
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const stamp = threadStamp({
    threads: threads?.length ?? 0,
    resolved: (threads ?? []).filter((t) => t.status === "resolved").length,
    comments: latest.count ?? 0,
    latest: latest.data?.[0]?.created_at ?? null,
  });
  if (request.nextUrl.searchParams.get("stamp") === stamp)
    return NextResponse.json({ stamp, unchanged: true });

  const { data: full } = await admin
    .from("comment_threads")
    .select(REVIEW_THREAD_SELECT)
    .eq("project_id", project.id)
    .order("created_at");
  return NextResponse.json({ stamp, threads: full ?? [] });
}
