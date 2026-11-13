import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/LoginForm";

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/projects";
}

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const dest = safeNext(next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(dest);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
      <Logo />
      <div className="grid flex-1 items-center gap-12 py-12 md:grid-cols-2">
        <div>
          <h2 className="font-display text-5xl font-bold leading-[1.05] tracking-tight">
            Prompt a prototype.
            <br />
            Share the real thing.
          </h2>
          <p className="mt-5 max-w-md text-lg text-stone-600">
            Describe a product and Realframe builds a working, clickable prototype. Publish it to a private link, invite
            reviewers and collect comments pinned right on the screens.
          </p>
          <ul className="mt-6 space-y-2 text-stone-700">
            <li>· Real, coded prototypes, not static mockups</li>
            <li>· Invite-only review links with sign-in</li>
            <li>· Every change saved as a version you can restore</li>
          </ul>
        </div>
        <div className="flex flex-col items-center gap-3 md:items-end">
          {error && (
            <p role="alert" className="w-full max-w-sm rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              That sign-in link has expired or was already used. Request a new one.
            </p>
          )}
          <LoginForm next={dest} />
        </div>
      </div>
    </main>
  );
}
