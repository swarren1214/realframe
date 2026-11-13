"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { makeSlug } from "@/lib/slug";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

export async function createProject(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || "Untitled prototype";
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, slug: makeSlug(name), owner_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  redirect(`/projects/${data.id}`);
}

export async function publishVersion(projectId: string, versionId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("projects")
    .update({ published: true, live_version_id: versionId, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function unpublish(projectId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("projects").update({ published: false }).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function setAccessMode(projectId: string, mode: "invite" | "public") {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("projects").update({ access_mode: mode }).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function renameProject(projectId: string, name: string) {
  const { supabase } = await requireUser();
  const clean = name.trim().slice(0, 80);
  if (!clean) return;
  const { error } = await supabase.from("projects").update({ name: clean }).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function inviteMember(projectId: string, email: string, role: "viewer" | "commenter" | "editor") {
  const { supabase, user } = await requireUser();
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error("Enter a valid email address.");
  const { error } = await supabase
    .from("project_members")
    .upsert({ project_id: projectId, email: clean, role, invited_by: user.id }, { onConflict: "project_id,email" });
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function removeMember(projectId: string, email: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("email", email);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function restoreVersion(projectId: string, versionId: string) {
  const { supabase } = await requireUser();
  const { data: v, error } = await supabase
    .from("versions")
    .select("html, number")
    .eq("id", versionId)
    .eq("project_id", projectId)
    .single();
  if (error || !v) throw new Error(error?.message ?? "Version not found");
  const { error: e2 } = await supabase.rpc("create_version", {
    p_project: projectId,
    p_html: v.html,
    p_prompt: null,
    p_summary: `Restored v${v.number}.`,
    p_source: "restore",
  });
  if (e2) throw new Error(e2.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProject(projectId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
  redirect("/projects");
}
