"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { action } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DesignSystemSource } from "@/lib/design-systems/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function cleanSource(s: DesignSystemSource): DesignSystemSource {
  switch (s.kind) {
    case "github":
      if (!s.repo || !s.branch)
        throw new Error("Pick a repository and branch.");
      return {
        kind: "github",
        installationId: Number(s.installationId),
        repo: s.repo,
        branch: s.branch,
        folder: (s.folder || "./").trim(),
      };
    case "npm":
      if (!s.package?.trim()) throw new Error("Enter the package name.");
      return {
        kind: "npm",
        package: s.package.trim(),
        version: s.version?.trim() || undefined,
        stylesheet: s.stylesheet?.trim() || undefined,
      };
    case "storybook":
      if (!/^https:\/\//.test(s.url?.trim() ?? ""))
        throw new Error("Enter the Storybook's https:// address.");
      return { kind: "storybook", url: s.url.trim() };
    case "upload":
      if (!s.paths?.length) throw new Error("Add at least one file.");
      return { kind: "upload", paths: s.paths.slice(0, 20) };
  }
}

/** Adds a design system to a team; the client then starts the import. */
export const createDesignSystem = action(
  async (
    teamId: string,
    name: string,
    source: DesignSystemSource,
    syncOnPush = false,
  ) => {
    const { supabase, user } = await requireUser();
    const clean = name.trim();
    if (!clean) throw new Error("Give it a name.");
    if (clean.length > 60)
      throw new Error("Keep the name under 60 characters.");
    const src = cleanSource(source);
    if (src.kind === "github") {
      // The installation has to be one this person connected.
      const { data } = await supabase
        .from("github_installations")
        .select("id")
        .eq("id", src.installationId)
        .maybeSingle();
      if (!data) throw new Error("Connect that GitHub account first.");
    }
    const { count } = await supabase
      .from("design_systems")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);
    const { data, error } = await supabase
      .from("design_systems")
      .insert({
        team_id: teamId,
        name: clean,
        source_kind: src.kind,
        source: src,
        sync_on_push: src.kind === "github" && syncOnPush,
        created_by: user.id,
        progress: "Waiting to start",
      })
      .select("id")
      .single();
    if (error)
      throw new Error(
        error.message.includes("row-level security")
          ? "Only team admins can import design systems."
          : error.message,
      );
    // The team's first system becomes its default.
    if (!count)
      await supabase.rpc("set_default_design_system", {
        p_team: teamId,
        p_ds: data.id,
      });
    revalidatePath("/design-systems");
    return data.id as string;
  },
);

export const renameDesignSystem = action(async (id: string, name: string) => {
  const { supabase } = await requireUser();
  const clean = name.trim();
  if (!clean) throw new Error("Give it a name.");
  const { error } = await supabase
    .from("design_systems")
    .update({ name: clean.slice(0, 60) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/design-systems/${id}`);
});

export const setSyncOnPush = action(async (id: string, on: boolean) => {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("design_systems")
    .update({ sync_on_push: on })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/design-systems/${id}`);
});

export const setTeamDefault = action(
  async (teamId: string, id: string | null) => {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("set_default_design_system", {
      p_team: teamId,
      p_ds: id,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/design-systems");
    if (id) revalidatePath(`/design-systems/${id}`);
  },
);

export const deleteDesignSystem = action(async (id: string) => {
  const { supabase } = await requireUser();
  const { data: ds } = await supabase
    .from("design_systems")
    .select("source")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("design_systems").delete().eq("id", id);
  if (error) throw new Error(error.message);
  const src = ds?.source as DesignSystemSource | undefined;
  if (src?.kind === "upload")
    await createAdminClient().storage.from("design-systems").remove(src.paths);
  revalidatePath("/design-systems");
});

/** Admins add rules directly; members suggest them for an admin to approve. */
export const addRule = action(async (dsId: string, body: string) => {
  const { supabase, user } = await requireUser();
  const text = body.trim();
  if (!text) throw new Error("Write the rule first.");
  if (text.length > 500) throw new Error("Keep rules under 500 characters.");
  const { data: role } = await supabase.rpc("design_system_team_role", {
    ds: dsId,
  });
  if (!role) throw new Error("You're not on this team.");
  const admin = role === "admin";
  const { error } = await supabase.from("design_system_rules").insert({
    design_system_id: dsId,
    body: text,
    origin: admin ? "admin" : "suggested",
    status: admin ? "active" : "pending",
    created_by: user.id,
    created_by_email: user.email?.toLowerCase() ?? null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/design-systems/${dsId}`);
  return admin ? "added" : "suggested";
});

export const updateRule = action(
  async (
    dsId: string,
    ruleId: string,
    patch: { body?: string; status?: "active" },
  ) => {
    const { supabase } = await requireUser();
    const next: Record<string, string> = {};
    if (patch.body !== undefined) {
      const t = patch.body.trim();
      if (!t) throw new Error("A rule can't be empty.");
      next.body = t.slice(0, 500);
    }
    if (patch.status) next.status = patch.status;
    const { error } = await supabase
      .from("design_system_rules")
      .update(next)
      .eq("id", ruleId);
    if (error) throw new Error(error.message);
    revalidatePath(`/design-systems/${dsId}`);
  },
);

export const removeRule = action(async (dsId: string, ruleId: string) => {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("design_system_rules")
    .delete()
    .eq("id", ruleId);
  if (error) throw new Error(error.message);
  revalidatePath(`/design-systems/${dsId}`);
});

/** Which design system a prototype builds with. Owners and editors can change it. */
export const setProjectDesignSystem = action(
  async (projectId: string, dsId: string | null) => {
    const { supabase } = await requireUser();
    const { data: role } = await supabase.rpc("project_role", { p: projectId });
    if (role !== "owner" && role !== "editor")
      throw new Error("Only owners and editors can change this.");
    const admin = createAdminClient();
    if (dsId) {
      const [{ data: project }, { data: ds }] = await Promise.all([
        admin.from("projects").select("team_id").eq("id", projectId).single(),
        supabase
          .from("design_systems")
          .select("team_id, synced_at")
          .eq("id", dsId)
          .maybeSingle(),
      ]);
      if (!ds || ds.team_id !== project?.team_id)
        throw new Error("That design system belongs to another team.");
      if (!ds.synced_at)
        throw new Error("That design system is still importing.");
    }
    const { error } = await admin
      .from("projects")
      .update({ design_system_id: dsId })
      .eq("id", projectId);
    if (error) throw new Error(error.message);
    revalidatePath(`/projects/${projectId}`);
  },
);
