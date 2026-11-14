"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { action } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { TEAM_COOKIE, type TeamRole } from "@/lib/teams";
import type { DeviceKind } from "@/lib/devices";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

async function setCurrent(teamId: string) {
  (await cookies()).set(TEAM_COOKIE, teamId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
}

function cleanEmail(email: string) {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean))
    throw new Error("Enter a valid email address.");
  return clean;
}

function cleanName(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw new Error("Give the team a name.");
  if (clean.length > 60) throw new Error("Keep the name under 60 characters.");
  return clean;
}

/** Work in another team: its prototypes, devices and design systems. */
export const switchTeam = action(async (teamId: string) => {
  const { supabase } = await requireUser();
  const { data: role } = await supabase.rpc("team_role", { t: teamId });
  if (!role) throw new Error("You're not on that team.");
  await setCurrent(teamId);
  revalidatePath("/", "layout");
});

export const createTeam = action(async (name: string) => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_team", {
    p_name: cleanName(name),
  });
  if (error) throw new Error(error.message);
  await setCurrent(data as string);
  revalidatePath("/", "layout");
  return data as string;
});

export const renameTeam = action(async (teamId: string, name: string) => {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("teams")
    .update({ name: cleanName(name) })
    .eq("id", teamId);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
});

export const inviteToTeam = action(
  async (teamId: string, email: string, role: TeamRole) => {
    const { supabase, user } = await requireUser();
    const clean = cleanEmail(email);
    // Someone who already has an account joins right away; others when they first sign in.
    const { data: existing } = await supabase
      .from("team_members")
      .select("email")
      .eq("team_id", teamId)
      .eq("email", clean)
      .maybeSingle();
    if (existing) throw new Error(`${clean} is already on this team.`);
    const { error } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, email: clean, role, invited_by: user.id });
    if (error)
      throw new Error(
        error.message.includes("row-level security")
          ? "Only admins can invite people."
          : error.message,
      );
    revalidatePath("/team");
  },
);

export const changeTeamRole = action(
  async (teamId: string, email: string, role: TeamRole) => {
    const { supabase } = await requireUser();
    const { error } = await supabase
      .from("team_members")
      .update({ role })
      .eq("team_id", teamId)
      .eq("email", email);
    if (error) throw new Error(error.message);
    revalidatePath("/team");
  },
);

export const removeFromTeam = action(async (teamId: string, email: string) => {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("email", email);
  if (error) throw new Error(error.message);
  if (email === user.email?.toLowerCase()) {
    (await cookies()).delete(TEAM_COOKIE);
    revalidatePath("/", "layout");
  } else revalidatePath("/team");
});

export const deleteTeam = action(async (teamId: string) => {
  const { supabase } = await requireUser();
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId);
  if (count)
    throw new Error(
      `Move or delete the team's ${count} prototype${count === 1 ? "" : "s"} first.`,
    );
  const { error } = await supabase.from("teams").delete().eq("id", teamId);
  if (error) throw new Error(error.message);
  (await cookies()).delete(TEAM_COOKIE);
  revalidatePath("/", "layout");
});

export const addTeamDevice = action(
  async (
    teamId: string,
    d: {
      name: string;
      kind: DeviceKind;
      width: number;
      height: number;
      frame: "bezel" | "none";
    },
  ) => {
    const { supabase, user } = await requireUser();
    const name = d.name.trim();
    if (!name) throw new Error("Name the device.");
    const width = Math.round(Number(d.width));
    const height = Math.round(Number(d.height));
    if (!(width >= 200 && width <= 7680 && height >= 200 && height <= 7680))
      throw new Error("Use a screen size between 200 and 7680 pixels.");
    const { error } = await supabase.from("team_devices").insert({
      team_id: teamId,
      name,
      kind: d.kind,
      width,
      height,
      frame: d.frame,
      created_by: user.id,
    });
    if (error)
      throw new Error(
        error.message.includes("row-level security")
          ? "Only admins can add team devices."
          : error.message,
      );
    revalidatePath("/team");
  },
);

export const removeTeamDevice = action(async (deviceId: string) => {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("team_devices")
    .delete()
    .eq("id", deviceId);
  if (error) throw new Error(error.message);
  revalidatePath("/team");
});

/** Owners move a prototype into another of their teams. */
export const moveProject = action(async (projectId: string, teamId: string) => {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("projects")
    .update({ team_id: teamId })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
});
