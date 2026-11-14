import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTeams } from "@/lib/teams";
import {
  DS_COLUMNS,
  type DesignSystem,
  type Rule,
} from "@/lib/design-systems/types";
import { Detail } from "./Detail";

export const dynamic = "force-dynamic";

export default async function DesignSystemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/?next=/design-systems/${id}`);
  const [{ data: profile }, { data: ds }, { teams }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    supabase
      .from("design_systems")
      .select(DS_COLUMNS)
      .eq("id", id)
      .maybeSingle(),
    loadTeams(supabase, user.id),
  ]);
  if (!ds) notFound();
  const team = teams.find(
    (t) => t.id === (ds as unknown as DesignSystem).team_id,
  );
  if (!team) notFound();
  const [{ data: rules }, { data: projects }] = await Promise.all([
    supabase
      .from("design_system_rules")
      .select("*")
      .eq("design_system_id", id)
      .order("created_at"),
    supabase
      .from("projects")
      .select("id, name, updated_at")
      .eq("design_system_id", id)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);
  return (
    <div>
      <Detail
        ds={ds as unknown as DesignSystem}
        team={team}
        rules={(rules ?? []) as Rule[]}
        projects={
          (projects ?? []) as { id: string; name: string; updated_at: string }[]
        }
      />
    </div>
  );
}
