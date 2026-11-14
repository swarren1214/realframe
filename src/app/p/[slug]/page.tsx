import type { Metadata, Viewport } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";
import { ArrowRight, Clock, KeyRound, LockKeyhole, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadTeamDevices } from "@/lib/teams";
import { guestCookieName, verifyGuest } from "@/lib/guest";
import type { Project, Role, Thread } from "@/lib/types";
import { Review } from "./Review";
import { AccountMenu } from "@/components/AccountMenu";
import { contentUrlFor } from "@/lib/content";
import { loadActiveRound } from "@/lib/services/reviews";

type VersionRow = {
  id: string;
  number: number;
  html: string;
  kind: "html" | "bundle";
  summary: string | null;
  created_at: string;
};
const withSrc = (v: VersionRow) => ({
  ...v,
  src: v.kind === "bundle" ? contentUrlFor(v.id) : null,
});

export const dynamic = "force-dynamic";

// viewport-fit=cover lets present mode use the whole screen, notch included, inside the safe areas.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#000000",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    robots: { index: false, follow: false },
    // Added to the home screen, the review link opens as a full-screen web app (the only way to get
    // real full screen on iPhone). The name stays generic so private prototype names never leak.
    manifest: `/p/${slug}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: "Prototype",
      statusBarStyle: "black-translucent",
    },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <div className="w-full max-w-sm rounded-[1.75rem] border border-stone-200/80 bg-card p-6 shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]">
        {children}
      </div>
    </main>
  );
}

const THREAD_SELECT =
  "id, version_id, x, y, status, created_at, guest_name, addressed_version_id, comments(id, thread_id, author_email, author_name, is_guest, body, created_at)";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; present?: string }>;
}) {
  const { slug } = await params;
  const { error: formError, present: presentParam } = await searchParams;
  const present = presentParam === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

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
      const guest = verifyGuest(
        (await cookies()).get(guestCookieName(lp.id))?.value,
        lp.id,
      );
      if (!guest)
        return (
          <PasswordGate
            project={lp}
            slug={slug}
            present={present}
            error={formError}
            signedInAs={user?.email ?? null}
          />
        );
      const [{ data: version }, { data: threads }, { data: nums }] =
        await Promise.all([
          admin
            .from("versions")
            .select("id, number, html, kind, summary, created_at")
            .eq("id", lp.live_version_id!)
            .maybeSingle(),
          admin
            .from("comment_threads")
            .select(THREAD_SELECT)
            .eq("project_id", lp.id)
            .order("created_at"),
          admin.from("versions").select("id, number").eq("project_id", lp.id),
        ]);
      if (!version) {
        return (
          <Shell>
            <h1 className="font-display text-lg font-bold tracking-tight">
              Nothing to show yet
            </h1>
          </Shell>
        );
      }
      return (
        <Review
          project={lp}
          role="guest"
          userEmail={null}
          guestName={guest.name}
          present={present}
          version={withSrc(version as VersionRow)}
          threads={(threads ?? []) as Thread[]}
          versionNumbers={Object.fromEntries(
            (nums ?? []).map((v: { id: string; number: number }) => [
              v.id,
              v.number,
            ]),
          )}
          teamDevices={await loadTeamDevices(admin, lp.team_id)}
          round={await loadActiveRound(admin, lp.id)}
        />
      );
    }
    if (!user) {
      return (
        <Shell>
          <LoginForm
            next={`/p/${slug}`}
            heading="Sign in to review this prototype"
          />
          <p className="mt-4 text-xs text-stone-500">
            Use the email address the prototype was shared with.
          </p>
        </Shell>
      );
    }
    return (
      <Shell>
        <LockKeyhole
          className="mb-3 size-6 text-raspberry-700"
          aria-hidden="true"
        />
        <h1 className="font-display text-lg font-bold tracking-tight">
          You don’t have access
        </h1>
        <p className="mt-1.5 text-[13px] text-stone-600">
          You’re signed in as <strong>{user.email}</strong>. Ask the owner to
          invite this address, or sign in with the one they invited.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <Button type="submit">
            <LogOut />
            Sign in with a different email
          </Button>
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
        <Clock className="mb-3 size-6 text-raspberry-700" aria-hidden="true" />
        <h1 className="font-display text-lg font-bold tracking-tight">
          Not published yet
        </h1>
        <p className="mt-1.5 text-[13px] text-stone-600">
          The owner hasn’t published “{p.name}” yet. Check back soon.
        </p>
      </Shell>
    );
  }

  let versionId = p.live_version_id;
  if (!versionId) {
    const { data } = await supabase
      .from("versions")
      .select("id")
      .eq("project_id", p.id)
      .order("number", { ascending: false })
      .limit(1);
    versionId = data?.[0]?.id ?? null;
  }
  const { data: version } = versionId
    ? await supabase
        .from("versions")
        .select("id, number, html, kind, summary, created_at")
        .eq("id", versionId)
        .maybeSingle()
    : { data: null };

  if (!version) {
    return (
      <Shell>
        <h1 className="font-display text-lg font-bold tracking-tight">
          Nothing to show yet
        </h1>
        <p className="mt-1.5 text-[13px] text-stone-600">
          This prototype doesn’t have a version yet.
        </p>
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
    role === "public"
      ? { data: [] }
      : await supabase
          .from("versions")
          .select("id, number")
          .eq("project_id", p.id);

  return (
    <Review
      project={p}
      role={role}
      userEmail={user?.email ?? null}
      version={withSrc(version as VersionRow)}
      threads={(threads ?? []) as Thread[]}
      versionNumbers={Object.fromEntries(
        (versionNumbers ?? []).map((v: { id: string; number: number }) => [
          v.id,
          v.number,
        ]),
      )}
      present={present}
      accountMenu={user ? <AccountMenu compact /> : null}
      teamDevices={await loadTeamDevices(createAdminClient(), p.team_id)}
      round={role === "public" ? null : await loadActiveRound(supabase, p.id)}
    />
  );
}

function PasswordGate({
  project,
  slug,
  present,
  error,
  signedInAs,
}: {
  project: Project;
  slug: string;
  present: boolean;
  error?: string;
  signedInAs: string | null;
}) {
  return (
    <Shell>
      <KeyRound className="mb-3 size-6 text-raspberry-700" aria-hidden="true" />
      <h1 className="font-display text-lg font-bold tracking-tight">
        {project.name}
      </h1>
      <p className="mt-1 text-[13px] text-stone-600">
        This prototype is password protected. Enter the password you were given.
      </p>
      <form
        action={`/api/p/${slug}/unlock`}
        method="post"
        className="mt-4 space-y-3"
      >
        <input
          type="hidden"
          name="back"
          value={`/p/${slug}${present ? "?present=1" : ""}`}
        />
        <div>
          <Label htmlFor="guest-name" className="mb-1.5">
            Your name
          </Label>
          <Input
            id="guest-name"
            name="name"
            required
            maxLength={60}
            autoComplete="name"
            placeholder="Shown next to your comments"
            className="h-10"
          />
        </div>
        <div>
          <Label htmlFor="guest-password" className="mb-1.5">
            Password
          </Label>
          <Input
            id="guest-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-10"
          />
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error === "name"
              ? "Enter your name."
              : "That password isn't right."}
          </p>
        )}
        <Button variant="default" size="lg" type="submit" className="w-full">
          View prototype
          <ArrowRight />
        </Button>
      </form>
      <p className="mt-4 text-xs text-stone-500">
        {signedInAs
          ? `Signed in as ${signedInAs}, which doesn't have access to this prototype.`
          : "Were you invited by email? "}
        {!signedInAs && (
          <a href={`/login?next=/p/${slug}`} className="font-semibold">
            Sign in instead
          </a>
        )}
      </p>
    </Shell>
  );
}
