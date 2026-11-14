import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/Logo";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { AvatarEditor } from "@/components/AvatarEditor";

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
  if (!user) redirect("/login");
  const name = String(formData.get("display_name") ?? "")
    .trim()
    .slice(0, 60);
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!name) redirect(`/welcome?next=${encodeURIComponent(next)}&error=name`);
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name, onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) redirect(`/welcome?next=${encodeURIComponent(next)}&error=save`);
  redirect(
    `${next}${next.includes("?") ? "&" : "?"}toast=${encodeURIComponent("Profile saved")}`,
  );
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
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at, avatar_url")
    .maybeSingle();
  const editing = Boolean(edit) || Boolean(profile?.onboarded_at);
  const { data: quota } = await supabase.rpc("generation_quota");
  const q = (
    quota as { plan: string; build_limit: number; remaining: number }[] | null
  )?.[0];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Logo />
      <form
        action={saveProfile}
        className="w-full max-w-sm space-y-4 rounded-[1.75rem] border border-stone-200/80 bg-card p-6 shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]"
      >
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">
            {editing ? "Your account" : "Welcome to Realframe"}
          </h1>
          <p className="mt-1 text-[13px] text-stone-600">
            {editing
              ? `Signed in as ${user.email}.`
              : "What should reviewers see next to your comments?"}
          </p>
        </div>
        <input type="hidden" name="next" value={safeNext(next)} />
        <AvatarEditor
          url={profile?.avatar_url ?? null}
          name={profile?.display_name ?? null}
          email={user.email ?? ""}
        />
        <div>
          <Label htmlFor="display_name" className="mb-1.5">
            Your name
          </Label>
          <Input
            id="display_name"
            name="display_name"
            required
            maxLength={60}
            autoComplete="name"
            autoFocus
            defaultValue={profile?.display_name ?? ""}
            placeholder="Alex Rivera"
            className="h-10"
          />
          {error && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {error === "name"
                ? "Enter a name to continue."
                : "Couldn't save that. Try again."}
            </p>
          )}
        </div>
        {q && (
          <p className="rounded-2xl bg-stone-50 px-3.5 py-3 text-xs text-stone-600">
            {q.plan === "pro"
              ? "You're on Pro: no monthly build cap, with $10 of AI usage included each month."
              : `The free plan includes ${q.build_limit} builds a month. You have ${q.remaining} left.`}{" "}
            <a href="/billing" className="font-semibold">
              Plan &amp; billing
            </a>
          </p>
        )}
        <Button variant="default" size="lg" type="submit" className="w-full">
          {editing ? "Save" : "Continue"}
          {editing ? <Check /> : <ArrowRight />}
        </Button>
        {editing && (
          <Button asChild variant="ghost" className="w-full">
            <Link href="/projects">
              <ArrowLeft />
              Back to prototypes
            </Link>
          </Button>
        )}
      </form>
    </main>
  );
}
