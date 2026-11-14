import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppHeader, APP_PAGE } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { InviteCards } from "@/components/teams/InviteCards";
import { loadInvites } from "@/lib/teams";

export const dynamic = "force-dynamic";

/** Where invite emails land: the signed-in person's open team invites. */
export default async function InvitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?next=/invites");
  const [{ data: profile }, invites] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    loadInvites(supabase),
  ]);
  return (
    <div className={APP_PAGE}>
      <AppHeader plan={profile?.plan} />
      <main className="mx-auto max-w-2xl space-y-5 px-2 pt-10">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Team invites
        </h1>
        {invites.length ? (
          <InviteCards invites={invites} />
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-card/50 px-6 py-12 text-center">
            <Inbox className="size-6 text-stone-400" aria-hidden="true" />
            <p className="text-sm font-semibold">No open invites</p>
            <p className="max-w-sm text-[13px] text-stone-600">
              Invites are sent to {user.email}. If you were invited at a
              different address, sign in with that one.
            </p>
            <Button asChild variant="outline">
              <Link href="/projects">Back to prototypes</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
