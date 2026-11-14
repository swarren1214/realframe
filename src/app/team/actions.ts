"use server";
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTeamInvite } from "@/lib/email";
import { syncSeats } from "@/lib/team-billing";
import { getStripe } from "@/lib/stripe";
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

async function origin() {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "www.realframe.app";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

async function emailInvite(
  teamId: string,
  email: string,
  role: TeamRole,
  inviterId: string,
  inviterEmail: string,
) {
  const admin = createAdminClient();
  const [{ data: team }, { data: me }] = await Promise.all([
    admin.from("teams").select("name").eq("id", teamId).single(),
    admin
      .from("profiles")
      .select("display_name")
      .eq("id", inviterId)
      .maybeSingle(),
  ]);
  return sendTeamInvite({
    to: email,
    teamName: team?.name ?? "a team",
    inviter: me?.display_name || inviterEmail,
    role,
    url: `${await origin()}/invites`,
  });
}

/** Invites someone by email. They join when they accept; the email links to their invites. */
export const inviteToTeam = action(
  async (teamId: string, email: string, role: TeamRole) => {
    const { supabase, user } = await requireUser();
    const clean = cleanEmail(email);
    const { data: existing } = await supabase
      .from("team_members")
      .select("email, status")
      .eq("team_id", teamId)
      .eq("email", clean)
      .maybeSingle();
    if (existing)
      throw new Error(
        existing.status === "pending"
          ? `${clean} already has an invite. Send it again from the list.`
          : `${clean} is already on this team.`,
      );
    const { error } = await supabase
      .from("team_members")
      .insert({
        team_id: teamId,
        email: clean,
        role,
        invited_by: user.id,
        status: "pending",
      });
    if (error)
      throw new Error(
        error.message.includes("row-level security")
          ? "Only admins can invite people."
          : error.message,
      );
    const mail = await emailInvite(
      teamId,
      clean,
      role,
      user.id,
      user.email ?? "A teammate",
    );
    revalidatePath("/team");
    return { emailed: mail.sent };
  },
);

export const resendInvite = action(async (teamId: string, email: string) => {
  const { supabase, user } = await requireUser();
  const { data: role } = await supabase.rpc("team_role", { t: teamId });
  if (role !== "admin") throw new Error("Only admins can send invites.");
  const { data: m } = await supabase
    .from("team_members")
    .select("role, status")
    .eq("team_id", teamId)
    .eq("email", email)
    .maybeSingle();
  if (!m || m.status !== "pending")
    throw new Error("That invite has already been answered.");
  const mail = await emailInvite(
    teamId,
    email,
    m.role as TeamRole,
    user.id,
    user.email ?? "A teammate",
  );
  if (!mail.sent)
    throw new Error(
      mail.reason === "not_configured"
        ? "Email isn't set up yet. Ask them to sign in at realframe.app and open Invites."
        : "The email didn't send. Try again.",
    );
});

/** Accept or decline an invite. Accepting switches you into the team. */
export const respondToInvite = action(
  async (teamId: string, accept: boolean) => {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("respond_team_invite", {
      p_team: teamId,
      p_accept: accept,
    });
    if (error) throw new Error(error.message);
    if (accept) {
      await setCurrent(teamId);
      await syncSeats(teamId);
    }
    revalidatePath("/", "layout");
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
  await syncSeats(teamId);
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
  const { data: role } = await supabase.rpc("team_role", { t: teamId });
  if (role !== "admin") throw new Error("Only admins can delete the team.");
  // Stop billing first, so a deleted team never charges again.
  const { data: billing } = await createAdminClient()
    .from("teams")
    .select("stripe_subscription_id")
    .eq("id", teamId)
    .maybeSingle();
  if (billing?.stripe_subscription_id) {
    await getStripe().subscriptions.cancel(billing.stripe_subscription_id, {
      prorate: true,
    });
  }
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

/** Hands a prototype to someone else on its team. The owner and team admins can do this. */
export const transferProject = action(
  async (projectId: string, userId: string) => {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("transfer_project", {
      p_project: projectId,
      p_user: userId,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
  },
);

/**
 * Shares a GitHub connection with a team (or stops sharing it). Only admins, and only for a
 * GitHub account they connected themselves. Teammates can then import and build from its repos.
 */
export const shareGitHub = action(
  async (teamId: string, installationId: number, on: boolean) => {
    const { supabase, user } = await requireUser();
    const { data: role } = await supabase.rpc("team_role", { t: teamId });
    if (role !== "admin")
      throw new Error("Only team admins can share GitHub connections.");
    const admin = createAdminClient();
    if (on) {
      const { data: mine } = await admin
        .from("github_installation_users")
        .select("installation_id")
        .eq("installation_id", installationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!mine)
        throw new Error("You can only share a GitHub account you connected.");
      const { error } = await admin
        .from("team_github_installations")
        .upsert({
          team_id: teamId,
          installation_id: installationId,
          shared_by: user.id,
        });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin
        .from("team_github_installations")
        .delete()
        .eq("team_id", teamId)
        .eq("installation_id", installationId);
      if (error) throw new Error(error.message);
    }
    revalidatePath("/team");
  },
);
