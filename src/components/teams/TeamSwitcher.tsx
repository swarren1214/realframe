import { createClient } from "@/lib/supabase/server";
import { loadTeams } from "@/lib/teams";
import { TeamSwitcherClient } from "@/components/teams/TeamSwitcherClient";

/** The team picker in the top bar. Loads the person's teams itself. */
export async function TeamSwitcher() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { teams, current } = await loadTeams(supabase, user.id);
  if (!current) return null;
  return <TeamSwitcherClient teams={teams} currentId={current.id} />;
}
