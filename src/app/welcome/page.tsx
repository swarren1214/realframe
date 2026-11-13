import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/projects";
}

async function saveProfile(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const name = String(formData.get("display_name") ?? "").trim().slice(0, 60);
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!name) redirect(`/welcome?next=${encodeURIComponent(next)}&error=name`);
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name, onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) redirect(`/welcome?next=${encodeURIComponent(next)}&error=save`);
  redirect(next);
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; edit?: string; error?: string }>;
}) {
  const { next, edit, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded_at").maybeSingle();
  const editing = Boolean(edit) || Boolean(profile?.onboarded_at);
  const { data: quota } = await supabase.rpc("generation_quota");
  const q = (quota as { daily_limit: number; remaining: number }[] | null)?.[0];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-stone-50 p-6">
      <Logo />
      <form action={saveProfile} className="w-full max-w-md space-y-4 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div>
          <h1 className="font-display text-2xl font-bold">{editing ? "Your account" : "Welcome to Realframe"}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {editing
              ? `Signed in as ${user.email}.`
              : "One quick thing: what should reviewers see next to your comments?"}
          </p>
        </div>
        <input type="hidden" name="next" value={safeNext(next)} />
        <div>
          <label htmlFor="display_name" className="mb-1.5 block text-sm font-semibold">
            Your name
          </label>
          <input
            id="display_name"
            name="display_name"
            required
            maxLength={60}
            autoComplete="name"
            autoFocus
            defaultValue={profile?.display_name ?? ""}
            placeholder="Alex Rivera"
            className="min-h-12 w-full rounded-lg border border-stone-300 px-3.5 text-[15px] outline-none focus:border-ember-700"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error === "name" ? "Enter a name to continue." : "Couldn't save that. Try again."}
            </p>
          )}
        </div>
        {q && (
          <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
            Your plan includes {q.daily_limit} prototype builds a day. You have {q.remaining} left right now.
          </p>
        )}
        <button className="min-h-12 w-full rounded-lg bg-ember-700 text-[15px] font-semibold text-white hover:bg-ember-800">
          {editing ? "Save" : "Continue"}
        </button>
        {editing && (
          <a href="/projects" className="block text-center text-sm text-stone-600">
            Back to prototypes
          </a>
        )}
      </form>
    </main>
  );
}
