import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { loadTeams } from "@/lib/teams";
import { DS_COLUMNS, type DesignSystem } from "@/lib/design-systems/types";
import { Library } from "./Library";

export const dynamic = "force-dynamic";

export default async function DesignSystemsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?next=/design-systems");
  const [{ data: profile }, { current }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    loadTeams(supabase, user.id),
  ]);
  if (!current) redirect("/projects");

  const [
    { data: systems },
    { data: used },
    { data: rules },
    { count: members },
  ] = await Promise.all([
    supabase
      .from("design_systems")
      .select(DS_COLUMNS)
      .eq("team_id", current.id)
      .order("created_at"),
    supabase
      .from("projects")
      .select("design_system_id")
      .eq("team_id", current.id)
      .not("design_system_id", "is", null),
    supabase.from("design_system_rules").select("design_system_id, status"),
    supabase
      .from("team_members")
      .select("email", { count: "exact", head: true })
      .eq("team_id", current.id)
      .eq("status", "active"),
  ]);
  const usage: Record<string, number> = {};
  for (const u of used ?? [])
    usage[u.design_system_id as string] =
      (usage[u.design_system_id as string] ?? 0) + 1;
  const ruleCounts: Record<string, number> = {};
  for (const r of rules ?? [])
    if (r.status === "active")
      ruleCounts[r.design_system_id as string] =
        (ruleCounts[r.design_system_id as string] ?? 0) + 1;

  return (
    <div className="min-h-screen px-4 pb-16">
      <AppHeader plan={profile?.plan} />
      <Library
        team={current}
        members={members ?? 1}
        systems={(systems ?? []) as unknown as DesignSystem[]}
        usage={usage}
        ruleCounts={ruleCounts}
      />
    </div>
  );
}
