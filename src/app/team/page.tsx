import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { loadTeams, type TeamDeviceRow, type TeamMember } from "@/lib/teams";
import { TeamSettings } from "./TeamSettings";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?next=/team");
  const [{ data: profile }, { current }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    loadTeams(supabase, user.id),
  ]);
  if (!current) redirect("/projects");

  const [
    { data: members },
    { data: devices },
    { count: prototypes },
    { data: people },
  ] = await Promise.all([
    supabase
      .from("team_members")
      .select("email, user_id, role, created_at")
      .eq("team_id", current.id)
      .order("created_at"),
    supabase
      .from("team_devices")
      .select("id, team_id, name, kind, width, height, frame")
      .eq("team_id", current.id)
      .order("created_at"),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("team_id", current.id),
    supabase.rpc("team_profiles", { t: current.id }),
  ]);
  const profiles = Object.fromEntries(
    (
      (people ?? []) as {
        user_id: string;
        display_name: string | null;
        avatar_url: string | null;
      }[]
    ).map((p) => [p.user_id, { name: p.display_name, avatar: p.avatar_url }]),
  );

  return (
    <div className="min-h-screen px-4 pb-16">
      <AppHeader plan={profile?.plan} />
      <TeamSettings
        team={current}
        me={user.email?.toLowerCase() ?? ""}
        members={(members ?? []) as TeamMember[]}
        devices={(devices ?? []) as TeamDeviceRow[]}
        prototypes={prototypes ?? 0}
        profiles={profiles}
      />
    </div>
  );
}
