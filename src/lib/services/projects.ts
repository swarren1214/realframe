import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSlug } from "@/lib/slug";
import type { AccessMode } from "@/lib/types";

// Project operations shared by the web app's server actions and the native apps' /api/v1.
// Each takes a Supabase client acting as the caller, so RLS decides who may do what.
// They throw UserError for problems the caller can fix; the message is safe to show.

export class UserError extends Error {}

export type MemberRole = "viewer" | "commenter" | "editor";

export async function createProject(
  supabase: SupabaseClient,
  ownerId: string,
  rawName: string,
  teamId: string | null,
) {
  const name = rawName.trim().slice(0, 80) || "Untitled prototype";
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, slug: makeSlug(name), owner_id: ownerId, team_id: teamId })
    .select("id, name, slug")
    .single();
  if (error) throw new UserError(error.message);
  return data as { id: string; name: string; slug: string };
}

export async function renameProject(supabase: SupabaseClient, projectId: string, rawName: string) {
  const name = rawName.trim().slice(0, 80);
  if (!name) throw new UserError("Give the prototype a name.");
  const { error } = await supabase.from("projects").update({ name }).eq("id", projectId);
  if (error) throw new UserError(error.message);
  return name;
}

export async function publishVersion(supabase: SupabaseClient, projectId: string, versionId: string) {
  const { error } = await supabase
    .from("projects")
    .update({ published: true, live_version_id: versionId, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw new UserError(error.message);
}

export async function unpublish(supabase: SupabaseClient, projectId: string) {
  const { error } = await supabase.from("projects").update({ published: false }).eq("id", projectId);
  if (error) throw new UserError(error.message);
}

export async function setAccessMode(supabase: SupabaseClient, projectId: string, mode: AccessMode) {
  if (!["invite", "public", "password"].includes(mode)) throw new UserError("Unknown access mode.");
  if (mode === "password") {
    const { data } = await supabase.from("projects").select("has_password").eq("id", projectId).single();
    if (!data?.has_password) throw new UserError("Set a password first.");
  }
  const { error } = await supabase.from("projects").update({ access_mode: mode }).eq("id", projectId);
  if (error) throw new UserError(error.message);
}

export async function inviteMember(
  supabase: SupabaseClient,
  invitedBy: string,
  projectId: string,
  email: string,
  role: MemberRole,
) {
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new UserError("Enter a valid email address.");
  if (!["viewer", "commenter", "editor"].includes(role)) throw new UserError("Unknown role.");
  const { error } = await supabase
    .from("project_members")
    .upsert({ project_id: projectId, email: clean, role, invited_by: invitedBy }, { onConflict: "project_id,email" });
  if (error) throw new UserError(error.message);
  return clean;
}

export async function removeMember(supabase: SupabaseClient, projectId: string, email: string) {
  const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("email", email);
  if (error) throw new UserError(error.message);
}
