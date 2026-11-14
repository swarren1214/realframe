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
  const name =
    String(formData.get("name") ?? "")
      .trim()
      .slice(0, 80) || "Untitled prototype";
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

export async function setAccessMode(projectId: string, mode: "invite" | "public" | "password") {
  const { supabase } = await requireUser();
  if (mode === "password") {
    const { data } = await supabase.from("projects").select("has_password").eq("id", projectId).single();
    if (!data?.has_password) throw new Error("Set a password first.");
  }
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
    .select("html, number, kind, bundle_id, bundle_files, bundle_bytes")
    .eq("id", versionId)
    .eq("project_id", projectId)
    .single();
  if (error || !v) throw new Error(error?.message ?? "Version not found");
  if (v.kind === "bundle") {
    const { error: e3 } = await supabase.rpc("create_bundle_version", {
      p_project: projectId,
      p_bundle: v.bundle_id,
      p_files: v.bundle_files ?? 0,
      p_bytes: v.bundle_bytes ?? 0,
      p_summary: `Restored v${v.number}.`,
      p_source: "restore",
    });
    if (e3) throw new Error(e3.message);
    revalidatePath(`/projects/${projectId}`);
    return;
  }
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

export async function keepVariant(projectId: string, variantId: string) {
  const { supabase } = await requireUser();
  const { data: variant, error } = await supabase
    .from("variants")
    .select("id, group_id, html, prompt, summary, position")
    .eq("id", variantId)
    .eq("project_id", projectId)
    .single();
  if (error || !variant) throw new Error(error?.message ?? "Variant not found.");
  const { data: version, error: vErr } = await supabase.rpc("create_version", {
    p_project: projectId,
    p_html: variant.html,
    p_prompt: variant.prompt,
    p_summary: variant.summary ?? `Variant ${variant.position}`,
    p_source: "variant",
  });
  if (vErr || !version) throw new Error(vErr?.message ?? "Couldn't save the variant.");
  const v = version as { id: string; number: number };
  await supabase.from("variants").update({ kept_version_id: v.id }).eq("id", variantId);
  // The rest of the group is done with once one is kept.
  await supabase.from("variants").delete().eq("group_id", variant.group_id).is("kept_version_id", null);
  revalidatePath(`/projects/${projectId}`);
  return { versionId: v.id, number: v.number };
}

export async function discardVariants(projectId: string, groupId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("variants")
    .delete()
    .eq("project_id", projectId)
    .eq("group_id", groupId)
    .is("kept_version_id", null);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function saveVisualEdit(projectId: string, html: string, summary: string) {
  const { supabase } = await requireUser();
  if (!/<html[\s>]/i.test(html) || html.length > 2_000_000) throw new Error("That document doesn't look right.");
  const { data: version, error } = await supabase.rpc("create_version", {
    p_project: projectId,
    p_html: html,
    p_prompt: null,
    p_summary: summary.slice(0, 300),
    p_source: "edit",
  });
  if (error || !version) throw new Error(error?.message ?? "Couldn't save the edit.");
  revalidatePath(`/projects/${projectId}`);
  const v = version as { id: string; number: number };
  return { versionId: v.id, number: v.number };
}

export async function setProjectPassword(projectId: string, password: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_project_password", { p_project: projectId, p_password: password });
  if (error) throw new Error(error.message.includes("6 to 200") ? "Use at least 6 characters." : error.message);
  revalidatePath(`/projects/${projectId}`);
}

export async function setGuestComments(projectId: string, on: boolean) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("projects").update({ guest_comments: on }).eq("id", projectId);
  if (error) throw new Error(error.message);
  revalidatePath(`/projects/${projectId}`);
}

const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "email",
  "auth",
  "login",
  "billing",
  "help",
  "support",
  "docs",
  "blog",
  "status",
  "cdn",
  "static",
  "assets",
  "dashboard",
  "realframe",
]);

export async function updateSlug(projectId: string, raw: string) {
  const { supabase } = await requireUser();
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (slug.length < 3 || slug.length > 60) throw new Error("Use 3 to 60 letters, numbers or dashes.");
  if (RESERVED_SLUGS.has(slug)) throw new Error("That address is reserved. Try another.");
  const { error } = await supabase.from("projects").update({ slug }).eq("id", projectId);
  if (error) throw new Error(error.code === "23505" ? "That address is taken. Try another." : error.message);
  revalidatePath(`/projects/${projectId}`);
  return slug;
}

// ---- Imports -------------------------------------------------------------------

async function projectForImport(projectId: string | null, name: string) {
  const { supabase, user } = await requireUser();
  if (projectId) {
    const { data: role } = await supabase.rpc("project_role", { p: projectId });
    if (role !== "owner" && role !== "editor") throw new Error("You can't add versions to this prototype.");
    return { supabase, projectId };
  }
  const clean = name.trim().slice(0, 80) || "Imported prototype";
  const { data, error } = await supabase
    .from("projects")
    .insert({ name: clean, slug: makeSlug(clean), owner_id: user.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { supabase, projectId: data.id as string };
}

/** Import one HTML or React file, as a new prototype (projectId null) or a new version. */
export async function importFile(projectId: string | null, name: string, filename: string, code: string) {
  const { importSingleFile } = await import("@/lib/import");
  const result = importSingleFile(filename, code); // throws a readable message for bad input
  const target = await projectForImport(projectId, name);
  const { data: version, error } = await target.supabase.rpc("create_version", {
    p_project: target.projectId,
    p_html: result.html,
    p_prompt: null,
    p_summary: result.summary,
    p_source: "import",
  });
  if (error || !version) throw new Error(error?.message ?? "Couldn't save the import.");
  revalidatePath(`/projects/${target.projectId}`);
  return { projectId: target.projectId, versionId: (version as { id: string }).id, warnings: result.warnings };
}

/** Step 1 of a zip import: the project to upload into and a fresh folder id for the files. */
export async function prepareBundle(projectId: string | null, name: string) {
  const target = await projectForImport(projectId, name);
  return { projectId: target.projectId, bundleId: crypto.randomUUID() };
}

/** Step 3 of a zip import, after the browser uploaded the files: make it a version. */
export async function finishBundle(projectId: string, bundleId: string, files: number, bytes: number, label: string) {
  const { supabase } = await requireUser();
  if (!/^[0-9a-f-]{36}$/.test(bundleId)) throw new Error("Bad upload.");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data: listed } = await createAdminClient().storage.from("bundles").list(`${projectId}/${bundleId}`, { search: "index.html" });
  if (!listed?.some((f) => f.name === "index.html")) throw new Error("The upload didn't finish: index.html is missing.");
  const { data: version, error } = await supabase.rpc("create_bundle_version", {
    p_project: projectId,
    p_bundle: bundleId,
    p_files: files,
    p_bytes: bytes,
    p_summary: `Imported ${label.slice(0, 120)} (${files} files).`,
    p_source: "import",
  });
  if (error || !version) throw new Error(error?.message ?? "Couldn't save the import.");
  revalidatePath(`/projects/${projectId}`);
  return { versionId: (version as { id: string }).id };
}

/** The content-domain URL of an imported app version the caller can see. */
export async function contentUrl(versionId: string) {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("versions").select("kind").eq("id", versionId).maybeSingle();
  if (!data || data.kind !== "bundle") throw new Error("Not an imported app.");
  const { contentUrlFor } = await import("@/lib/content");
  return contentUrlFor(versionId);
}
