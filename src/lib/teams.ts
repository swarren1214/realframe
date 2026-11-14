import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  toDevice,
  type Team,
  type TeamDeviceRow,
  type TeamRole,
} from "@/lib/team-shared";

export * from "@/lib/team-shared";
export const TEAM_COOKIE = "rf_team";
/** The teams the signed-in person belongs to, and the one they're working in (from a cookie). */
export async function loadTeams(supabase: SupabaseClient, userId: string) {
  // Invites sent to this email before they signed in become memberships now.
  await supabase.rpc("claim_team_invites");
  const { data } = await supabase
    .from("team_members")
    .select("role, teams(id, name, personal)")
    .eq("user_id", userId);
  type Row = {
    role: TeamRole;
    teams: { id: string; name: string; personal: boolean } | null;
  };
  const teams: Team[] = ((data ?? []) as unknown as Row[])
    .filter((r) => r.teams)
    .map((r) => ({ ...r.teams!, role: r.role }))
    // Personal first, then by name.
    .sort(
      (a, b) =>
        Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name),
    );
  const wanted = (await cookies()).get(TEAM_COOKIE)?.value;
  const current = teams.find((t) => t.id === wanted) ?? teams[0] ?? null;
  return { teams, current };
}

/** A team's device templates, as devices the picker can show. */
export async function loadTeamDevices(
  supabase: SupabaseClient,
  teamId: string | null | undefined,
) {
  if (!teamId) return [];
  const { data } = await supabase
    .from("team_devices")
    .select("id, team_id, name, kind, width, height, frame")
    .eq("team_id", teamId)
    .order("created_at");
  return ((data ?? []) as TeamDeviceRow[]).map(toDevice);
}
