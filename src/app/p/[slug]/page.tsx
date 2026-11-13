import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";
import { createClient } from "@/lib/supabase/server";
import type { Project, Role, Thread } from "@/lib/types";
import { Review } from "./Review";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-50 p-6">
      <Logo />
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">{children}</div>
    </main>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase.from("projects").select("*").eq("slug", slug).maybeSingle();

  if (!project) {
    if (!user) {
      return (
        <Shell>
          <LoginForm next={`/p/${slug}`} heading="Sign in to review this prototype" />
          <p className="mt-4 text-xs text-stone-500">Use the email address the prototype was shared with.</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="font-display text-xl font-semibold">You don’t have access</h1>
        <p className="mt-2 text-sm text-stone-600">
          You’re signed in as <strong>{user.email}</strong>. Ask the owner to invite this address, or sign in with the one they
          invited.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button className="min-h-10 rounded-lg border border-stone-200 px-4 text-sm font-semibold hover:bg-stone-50">
            Sign in with a different email
          </button>
        </form>
      </Shell>
    );
  }

  const p = project as Project;
  const { data: roleData } = await supabase.rpc("project_role", { p: p.id });
  const role = (roleData ?? "public") as Role;
  const isBuilder = role === "owner" || role === "editor";

  if ((!p.published || !p.live_version_id) && !isBuilder) {
    return (
      <Shell>
        <h1 className="font-display text-xl font-semibold">Not published yet</h1>
        <p className="mt-2 text-sm text-stone-600">The owner hasn’t published “{p.name}” yet. Check back soon.</p>
      </Shell>
    );
  }

  let versionId = p.live_version_id;
  if (!versionId) {
    const { data } = await supabase.from("versions").select("id").eq("project_id", p.id).order("number", { ascending: false }).limit(1);
    versionId = data?.[0]?.id ?? null;
  }
  const { data: version } = versionId
    ? await supabase.from("versions").select("id, number, html, summary, created_at").eq("id", versionId).maybeSingle()
    : { data: null };

  if (!version) {
    return (
      <Shell>
        <h1 className="font-display text-xl font-semibold">Nothing to show yet</h1>
        <p className="mt-2 text-sm text-stone-600">This prototype doesn’t have a version yet.</p>
      </Shell>
    );
  }

  const { data: threads } =
    role === "public"
      ? { data: [] }
      : await supabase
          .from("comment_threads")
          .select("id, version_id, x, y, status, created_at, comments(id, thread_id, author_email, author_name, body, created_at)")
          .eq("project_id", p.id)
          .order("created_at");

  const { data: versionNumbers } =
    role === "public" ? { data: [] } : await supabase.from("versions").select("id, number").eq("project_id", p.id);

  return (
    <Review
      project={p}
      role={role}
      userEmail={user?.email ?? null}
      version={version as { id: string; number: number; html: string; summary: string | null; created_at: string }}
      threads={(threads ?? []) as Thread[]}
      versionNumbers={Object.fromEntries((versionNumbers ?? []).map((v: { id: string; number: number }) => [v.id, v.number]))}
    />
  );
}
