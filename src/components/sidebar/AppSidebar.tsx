import { createClient } from "@/lib/supabase/server";
import { loadInvites, loadTeams } from "@/lib/teams";
import { AccountMenu } from "@/components/AccountMenu";
import { AppSidebarClient } from "./AppSidebarClient";

/**
 * The left sidebar for account-level pages (prototypes, design systems,
 * devices, members, billing, settings). Loads the workspace it shows itself.
 */
export async function AppSidebar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ teams, current }, invites, { data: profile }] = await Promise.all([
    loadTeams(supabase, user.id),
    loadInvites(supabase),
    supabase
      .from("profiles")
      .select("display_name, plan")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  if (!current) return null;

  let plan: "free" | "pro" | "team" = profile?.plan === "pro" ? "pro" : "free";
  let members = 1;
  if (!current.personal) {
    const [{ data: team }, { count }] = await Promise.all([
      supabase.from("teams").select("plan").eq("id", current.id).maybeSingle(),
      supabase
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .eq("team_id", current.id)
        .eq("status", "active"),
    ]);
    plan = team?.plan === "team" ? "team" : "free";
    members = count ?? 1;
  }

  return (
    <AppSidebarClient
      teams={teams}
      currentId={current.id}
      invites={invites.length}
      plan={plan}
      members={members}
      ownerName={profile?.display_name ?? null}
      account={<AccountMenu variant="sidebar" />}
      accountCompact={<AccountMenu compact />}
    />
  );
}
