import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { createProject } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded_at").maybeSingle();
  if (profile && !profile.onboarded_at) redirect("/welcome");

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, slug, owner_id, published, updated_at")
    .order("updated_at", { ascending: false });

  const mine = (projects ?? []).filter((p) => p.owner_id === user.id);
  const shared = (projects ?? []).filter((p) => p.owner_id !== user.id);

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b border-stone-200 bg-white px-6 py-3">
        <Logo href="/projects" />
        <div className="flex-1" />
        <Link href="/welcome?edit=1" className="text-sm text-stone-600 no-underline hover:underline" title={user.email}>
          {profile?.display_name || user.email}
        </Link>
        <form action="/auth/signout" method="post">
          <button className="min-h-10 rounded-lg border border-stone-200 px-3 text-sm font-medium hover:bg-stone-50">
            Sign out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Your prototypes</h1>
        <form action={createProject} className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-stone-200 bg-white p-4">
          <label htmlFor="name" className="sr-only">
            Prototype name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="Name a new prototype, e.g. Dispatch Board v2"
            className="min-h-11 flex-1 rounded-lg border border-stone-300 px-3 outline-none focus:border-ember-700"
          />
          <button className="min-h-11 rounded-lg bg-ember-700 px-5 font-semibold text-white hover:bg-ember-800">
            New prototype
          </button>
        </form>

        <ProjectList title="Created by you" items={mine} empty="No prototypes yet. Name one above to start." />
        {shared.length > 0 && <ProjectList title="Shared with you" items={shared} shared />}
      </main>
    </div>
  );
}

function ProjectList({
  title,
  items,
  empty,
  shared,
}: {
  title: string;
  items: { id: string; name: string; slug: string; published: boolean; updated_at: string }[];
  empty?: string;
  shared?: boolean;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-stone-600">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                href={shared ? `/p/${p.slug}` : `/projects/${p.id}`}
                className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-ember-700"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.published && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">Live</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  Updated {new Date(p.updated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
