import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestCookieName, verifyGuest } from "@/lib/guest";
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

const THREAD_SELECT =
  "id, version_id, x, y, status, created_at, guest_name, comments(id, thread_id, author_email, author_name, is_guest, body, created_at)";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error: formError } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase.from("projects").select("*").eq("slug", slug).maybeSingle();

  if (!project) {
    // Password-protected links: readable to guests who entered the password.
    const admin = createAdminClient();
    const { data: locked } = await admin
      .from("projects")
      .select("*")
      .eq("slug", slug)
      .eq("published", true)
      .eq("access_mode", "password")
      .maybeSingle();
    if (locked) {
      const lp = locked as Project;
      const guest = verifyGuest((await cookies()).get(guestCookieName(lp.id))?.value, lp.id);
      if (!guest) return <PasswordGate project={lp} slug={slug} error={formError} signedInAs={user?.email ?? null} />;
      const [{ data: version }, { data: threads }, { data: nums }] = await Promise.all([
        admin.from("versions").select("id, number, html, summary, created_at").eq("id", lp.live_version_id!).maybeSingle(),
        admin.from("comment_threads").select(THREAD_SELECT).eq("project_id", lp.id).order("created_at"),
        admin.from("versions").select("id, number").eq("project_id", lp.id),
      ]);
      if (!version) {
        return (
          <Shell>
            <h1 className="font-display text-xl font-semibold">Nothing to show yet</h1>
          </Shell>
        );
      }
      return (
        <Review
          project={lp}
          role="guest"
          userEmail={null}
          guestName={guest.name}
          version={version as { id: string; number: number; html: string; summary: string | null; created_at: string }}
          threads={(threads ?? []) as Thread[]}
          versionNumbers={Object.fromEntries((nums ?? []).map((v: { id: string; number: number }) => [v.id, v.number]))}
        />
      );
    }
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
          .select(THREAD_SELECT)
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

function PasswordGate({
  project,
  slug,
  error,
  signedInAs,
}: {
  project: Project;
  slug: string;
  error?: string;
  signedInAs: string | null;
}) {
  return (
    <Shell>
      <h1 className="font-display text-xl font-semibold">{project.name}</h1>
      <p className="mt-1 text-sm text-stone-600">This prototype is password protected. Enter the password you were given.</p>
      <form action={`/api/p/${slug}/unlock`} method="post" className="mt-5 space-y-3">
        <input type="hidden" name="back" value={`/p/${slug}`} />
        <div>
          <label htmlFor="guest-name" className="mb-1 block text-sm font-semibold">
            Your name
          </label>
          <input
            id="guest-name"
            name="name"
            required
            maxLength={60}
            autoComplete="name"
            placeholder="Shown next to your comments"
            className="min-h-11 w-full rounded-lg border border-stone-300 px-3"
          />
        </div>
        <div>
          <label htmlFor="guest-password" className="mb-1 block text-sm font-semibold">
            Password
          </label>
          <input
            id="guest-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="min-h-11 w-full rounded-lg border border-stone-300 px-3"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error === "name" ? "Enter your name." : "That password isn't right."}
          </p>
        )}
        <button className="min-h-11 w-full rounded-lg bg-ember-700 font-semibold text-white hover:bg-ember-800">View prototype</button>
      </form>
      <p className="mt-4 text-xs text-stone-500">
        {signedInAs
          ? `Signed in as ${signedInAs}, which doesn't have access to this prototype.`
          : "Were you invited by email? "}
        {!signedInAs && (
          <a href={`/?next=/p/${slug}`} className="font-semibold">
            Sign in instead
          </a>
        )}
      </p>
    </Shell>
  );
}
