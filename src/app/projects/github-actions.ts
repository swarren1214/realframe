"use server";
import { action } from "@/lib/safe-action";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeSlug } from "@/lib/slug";
import { getAppConfig, installationToken, listBranches, listInstallationRepos, signState } from "@/lib/github/app";
import { detectBuild } from "@/lib/github/detect";
import { startRunner } from "@/lib/builds/run";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  return { supabase, user };
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.realframe.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Checks the signed-in person may use an installation (GitHub confirmed it when they connected). */
async function requireInstallation(installationId: number) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("github_installations").select("id, suspended_at").eq("id", installationId).maybeSingle();
  if (!data) throw new Error("Connect that GitHub account first.");
  if (data.suspended_at) throw new Error("That GitHub installation is suspended.");
  return { supabase, user };
}

export type GitHubStatus = {
  configured: boolean;
  installUrl: string | null;
  installations: { id: number; login: string; type: string }[];
};

export const githubStatus = action(async (next: string): Promise<GitHubStatus> => {
  const { supabase, user } = await requireUser();
  const config = await getAppConfig();
  if (!config) return { configured: false, installUrl: null, installations: [] };
  const { data } = await supabase.from("github_installations").select("id, account_login, account_type").order("account_login");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/projects";
  return {
    configured: true,
    installUrl: `https://github.com/apps/${config.slug}/installations/new?state=${encodeURIComponent(signState({ uid: user.id, next: safeNext }))}`,
    installations: (data ?? []).map((i) => ({ id: i.id as number, login: i.account_login, type: i.account_type })),
  };
});

export const githubRepos = action(async (installationId: number) => {
  const { supabase } = await requireInstallation(installationId);
  const repos = await listInstallationRepos(installationId);
  // Which of the caller's prototypes already use each repository.
  const { data: used } = await supabase.from("project_sources").select("repo_id, projects(name)");
  const usedBy = new Map<number, string[]>();
  for (const u of used ?? []) {
    const name = (u.projects as unknown as { name: string } | null)?.name;
    if (name) usedBy.set(u.repo_id as number, [...(usedBy.get(u.repo_id as number) ?? []), name]);
  }
  return repos.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    private: r.private,
    defaultBranch: r.default_branch,
    language: r.language,
    pushedAt: r.pushed_at,
    usedBy: usedBy.get(r.id) ?? [],
  }));
});

export const githubBranches = action(async (installationId: number, repo: string) => {
  await requireInstallation(installationId);
  return listBranches(await installationToken(installationId), repo);
});

export const githubDetect = action(async (installationId: number, repo: string, branch: string, rootDir: string) => {
  await requireInstallation(installationId);
  return detectBuild(await installationToken(installationId), repo, branch, rootDir.replace(/^\.?\/?|\/+$/g, ""));
});

export type ConnectInput = {
  projectId: string | null;
  name: string;
  installationId: number;
  repoId: number;
  repoFullName: string;
  branch: string;
  rootDir: string;
  installCommand: string;
  buildCommand: string;
  outputDir: string;
  framework: string | null;
};

const clean = (s: string, max = 300) => s.trim().slice(0, max);

/** Links a repository to a prototype (creating the prototype if needed) and starts the first build. */
export const connectRepo = action(async (input: ConnectInput) => {
  const { supabase, user } = await requireInstallation(input.installationId);
  // The repository must really be in this installation.
  const repos = await listInstallationRepos(input.installationId);
  const repo = repos.find((r) => r.id === input.repoId && r.full_name === input.repoFullName);
  if (!repo) throw new Error("That repository isn't shared with Realframe.");

  let projectId = input.projectId;
  let ownerId = user.id;
  if (projectId) {
    const { data: role } = await supabase.rpc("project_role", { p: projectId });
    if (role !== "owner") throw new Error("Only the owner can connect a repository.");
  } else {
    const name = clean(input.name, 80) || repo.name;
    const { data, error } = await supabase
      .from("projects")
      .insert({ name, slug: makeSlug(name), owner_id: user.id })
      .select("id, owner_id")
      .single();
    if (error) throw new Error(error.message);
    projectId = data.id as string;
    ownerId = data.owner_id as string;
  }

  const admin = createAdminClient();
  const { error: srcErr } = await admin.from("project_sources").upsert({
    project_id: projectId,
    installation_id: input.installationId,
    repo_id: repo.id,
    repo_full_name: repo.full_name,
    branch: clean(input.branch, 200) || repo.default_branch,
    root_dir: clean(input.rootDir, 200).replace(/^\.?\/?|\/+$/g, ""),
    install_command: clean(input.installCommand) || null,
    build_command: clean(input.buildCommand) || null,
    output_dir: clean(input.outputDir, 200).replace(/^\.\/?/, "") || ".",
    framework: input.framework,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  });
  if (srcErr) throw new Error(srcErr.message);

  const buildId = await queueBuild(projectId, user.id, ownerId, "import");
  revalidatePath(`/projects/${projectId}`);
  return { projectId, buildId };
});

type UploadOrigin = { upload_path: string; settings: Record<string, unknown> };

async function queueBuild(
  projectId: string,
  requestedBy: string,
  billedTo: string,
  trigger: "import" | "manual" | "retry",
  upload?: UploadOrigin,
) {
  const admin = createAdminClient();
  let from: Record<string, unknown>;
  if (upload) {
    from = upload;
  } else {
    const { data: source } = await admin.from("project_sources").select("repo_full_name, branch").eq("project_id", projectId).maybeSingle();
    if (!source) throw new Error("This prototype isn't connected to a repository.");
    from = { repo_full_name: source.repo_full_name, branch: source.branch };
  }
  const { count } = await admin
    .from("builds")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .in("status", ["queued", "building"])
    .gte("queued_at", new Date(Date.now() - 25 * 60_000).toISOString());
  if (count) throw new Error("A build is already running for this prototype.");
  const { data: build, error } = await admin
    .from("builds")
    .insert({
      project_id: projectId,
      requested_by: requestedBy,
      billed_to: billedTo,
      trigger,
      ...from,
    })
    .select("id")
    .single();
  if (error || !build) throw new Error(error?.message ?? "Couldn't queue the build.");
  await startRunner(build.id as string, await origin());
  return build.id as string;
}

/** Build the latest commit now (or again after a failure). */
export const buildNow = action(async (projectId: string, retry = false) => {
  const { supabase, user } = await requireUser();
  const { data: role } = await supabase.rpc("project_role", { p: projectId });
  if (role !== "owner" && role !== "editor") throw new Error("You can't build this prototype.");
  const { data: project } = await supabase.from("projects").select("owner_id").eq("id", projectId).single();
  // Clear anything stuck from a runner that died.
  await createAdminClient()
    .from("builds")
    .update({ status: "failed", error_summary: "The build stopped responding.", finished_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .in("status", ["queued", "building"])
    .lt("queued_at", new Date(Date.now() - 25 * 60_000).toISOString());
  // A prototype built from an uploaded zip rebuilds that same upload.
  const { data: source } = await supabase.from("project_sources").select("project_id").eq("project_id", projectId).maybeSingle();
  let upload: UploadOrigin | undefined;
  if (!source) {
    const { data: last } = await createAdminClient()
      .from("builds")
      .select("upload_path, settings")
      .eq("project_id", projectId)
      .not("upload_path", "is", null)
      .order("queued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) throw new Error("This prototype isn't connected to a repository.");
    upload = { upload_path: last.upload_path as string, settings: last.settings as Record<string, unknown> };
  }
  const buildId = await queueBuild(projectId, user.id, (project?.owner_id as string) ?? user.id, retry ? "retry" : "manual", upload);
  revalidatePath(`/projects/${projectId}`);
  return buildId;
});

/** Builds a source zip the browser uploaded to <project>/uploads/<id>.zip. */
export const buildUploadedSource = action(
  async (
    projectId: string,
    uploadPath: string,
    settings: { installCommand: string | null; buildCommand: string | null; outputDir: string; framework: string; label: string },
  ) => {
    const { supabase, user } = await requireUser();
    const { data: role } = await supabase.rpc("project_role", { p: projectId });
    if (role !== "owner" && role !== "editor") throw new Error("You can't build this prototype.");
    const prefix = `${projectId}/uploads/`;
    if (!uploadPath.startsWith(prefix) || !/^[0-9a-f-]{36}\.zip$/.test(uploadPath.slice(prefix.length))) throw new Error("Bad upload.");
    const { data: project } = await supabase.from("projects").select("owner_id").eq("id", projectId).single();
    const buildId = await queueBuild(projectId, user.id, (project?.owner_id as string) ?? user.id, "import", {
      upload_path: uploadPath,
      settings: {
        installCommand: settings.installCommand?.slice(0, 300) ?? null,
        buildCommand: settings.buildCommand?.slice(0, 300) ?? null,
        outputDir: settings.outputDir.slice(0, 200),
        framework: settings.framework.slice(0, 60),
        label: settings.label.slice(0, 120),
      },
    });
    revalidatePath(`/projects/${projectId}`);
    return buildId;
  },
);

export const cancelBuild = action(async (projectId: string, buildId: string) => {
  const { supabase } = await requireUser();
  const { data: role } = await supabase.rpc("project_role", { p: projectId });
  if (role !== "owner" && role !== "editor") throw new Error("You can't change this prototype.");
  const admin = createAdminClient();
  const { data: build } = await admin.from("builds").select("status, sandbox_id").eq("id", buildId).eq("project_id", projectId).single();
  if (!build || !["queued", "building"].includes(build.status)) return;
  await admin.from("builds").update({ status: "canceled", finished_at: new Date().toISOString() }).eq("id", buildId);
  if (build.sandbox_id) {
    const { Sandbox } = await import("@vercel/sandbox");
    await Sandbox.get({ name: build.sandbox_id })
      .then((s) => s.stop())
      .catch(() => {});
  }
  revalidatePath(`/projects/${projectId}`);
});

export const updateSource = action(async (projectId: string, patch: { buildOnPush?: boolean; publishOnPush?: boolean }) => {
  const { supabase } = await requireUser();
  const { data: role } = await supabase.rpc("project_role", { p: projectId });
  if (role !== "owner") throw new Error("Only the owner can change the repository settings.");
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.buildOnPush === "boolean") fields.build_on_push = patch.buildOnPush;
  if (typeof patch.publishOnPush === "boolean") fields.publish_on_push = patch.publishOnPush;
  await createAdminClient().from("project_sources").update(fields).eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`);
});

export const disconnectRepo = action(async (projectId: string) => {
  const { supabase } = await requireUser();
  const { data: role } = await supabase.rpc("project_role", { p: projectId });
  if (role !== "owner") throw new Error("Only the owner can disconnect the repository.");
  await createAdminClient().from("project_sources").delete().eq("project_id", projectId);
  revalidatePath(`/projects/${projectId}`);
});
