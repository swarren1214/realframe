import { createClient } from "@/lib/supabase/server";
import { loadInvites, loadTeams } from "@/lib/teams";
import { TeamSwitcherClient } from "@/components/teams/TeamSwitcherClient";

/** The team picker in the top bar. Loads the person's teams itself. */
export async function TeamSwitcher() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ teams, current }, invites] = await Promise.all([
    loadTeams(supabase, user.id),
    loadInvites(supabase),
  ]);
  if (!current) return null;
  return (
    <TeamSwitcherClient
      teams={teams}
      currentId={current.id}
      invites={invites.length}
    />
  );
}
