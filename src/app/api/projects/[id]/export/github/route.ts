import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ensurePullRequest,
  installationSettingsUrl,
  installationToken,
  pushFiles,
} from "@/lib/github/app";
import {
  AI_FORMATS,
  FORMAT_INFO,
  readFormat,
  safeBranch,
  safeFolder,
  safePath,
} from "@/lib/export";

export const maxDuration = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const REPO = /^[\w.-]{1,100}\/[\w.-]{1,100}$/;
const MAX_FILES = 300;
const MAX_BYTES = 10 * 1024 * 1024;

type Body = {
  installationId?: number;
  repo?: string;
  branch?: string;
  folder?: string;
  message?: string;
  pullRequest?: boolean;
  format?: string;
  versionId?: string;
  files?: { path?: string; content?: string }[];
  selection?: { label?: string; selector?: string }[];
};

const fail = (error: string, status: number, extra: object = {}) =>
  NextResponse.json({ error, ...extra }, { status });

/**
 * POST /api/projects/[id]/export/github
 * Commits an export's files to a branch of a repository the Realframe GitHub App can reach,
 * in one commit, and opens a pull request into the default branch unless asked not to.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sign in first.", 401);
  const { data: role } = await supabase.rpc("project_role", { p: id });
  if (role !== "owner" && role !== "editor")
    return fail("Only owners and editors can export this prototype.", 403);

  const body = (await request.json().catch(() => ({}))) as Body;
  const format = readFormat(body.format);
  if (!format || !body.versionId || !UUID.test(body.versionId))
    return fail("Pick a format and a version.", 400);
  const installationId = Number(body.installationId);
  if (!Number.isSafeInteger(installationId) || installationId <= 0)
    return fail("Pick a GitHub account.", 400);
  const repo = String(body.repo ?? "");
  if (!REPO.test(repo)) return fail("Pick a repository.", 400);
  const branch = safeBranch(String(body.branch ?? ""));
  if (!branch)
    return fail(
      "That branch name won't work. Use letters, numbers, dashes, dots and slashes.",
      400,
    );
  const folder = safeFolder(String(body.folder ?? ""));
  if (folder === null)
    return fail(
      "That folder won't work. Use a plain path like web/export.",
      400,
    );

  const raw = Array.isArray(body.files) ? body.files : [];
  if (!raw.length) return fail("There's nothing to push yet.", 400);
  if (raw.length > MAX_FILES)
    return fail(`That's more than ${MAX_FILES} files.`, 413);
  const files: { path: string; content: string }[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const f of raw) {
    const path = safePath(String(f.path ?? ""));
    if (!path)
      return fail(`"${String(f.path).slice(0, 80)}" isn't a safe path.`, 400);
    const full = folder ? `${folder}/${path}` : path;
    if (seen.has(full)) continue;
    seen.add(full);
    const content = String(f.content ?? "");
    bytes += Buffer.byteLength(content);
    files.push({ path: full, content });
  }
  if (bytes > MAX_BYTES) return fail("That's more than 10 MB to push.", 413);

  // The person must be able to use this installation (they connected it, or a team shares it).
  const { data: install } = await supabase
    .from("github_installations")
    .select("id, account_login, account_type, suspended_at")
    .eq("id", installationId)
    .maybeSingle();
  if (!install) return fail("Connect that GitHub account first.", 403);
  if (install.suspended_at)
    return fail("That GitHub installation is suspended.", 403);

  const { data: version } = await supabase
    .from("versions")
    .select("id, number, project_id, projects(name)")
    .eq("id", body.versionId)
    .eq("project_id", id)
    .maybeSingle();
  if (!version) return fail("That version doesn't exist.", 404);
  const projectName =
    (version.projects as unknown as { name: string } | null)?.name ??
    "Prototype";
  const scope = FORMAT_INFO[format].scope;
  const what =
    scope === "selection"
      ? `${
          (body.selection ?? [])
            .map((s) => String(s.label ?? ""))
            .filter(Boolean)
            .join(", ")
            .slice(0, 80) || "a part"
        } from ${projectName}`
      : projectName;
  const message =
    String(body.message ?? "")
      .trim()
      .slice(0, 500) || `Export ${what} v${version.number} from Realframe`;

  try {
    const token = await installationToken(installationId);
    const pushed = await pushFiles(token, repo, { branch, message, files });
    let pr: { url: string; number: number; created: boolean } | null = null;
    if (body.pullRequest !== false && branch !== pushed.defaultBranch)
      pr = await ensurePullRequest(token, repo, {
        branch,
        base: pushed.defaultBranch,
        title: message.split("\n")[0].slice(0, 120),
        body: `Exported from Realframe: **${projectName}** v${version.number} (${FORMAT_INFO[format].name}).\n\n${files.length} file${files.length === 1 ? "" : "s"}${folder ? ` in \`${folder}/\`` : ""}.`,
      });

    // AI exports were logged when they were generated; file formats are logged here.
    if (!AI_FORMATS.includes(format)) {
      const { error } = await supabase.from("exports").insert({
        project_id: id,
        version_id: version.id,
        user_id: user.id,
        scope,
        format,
        selectors: (body.selection ?? []).slice(0, 5).map((s) => ({
          label: String(s.label ?? "").slice(0, 60),
          selector: String(s.selector ?? "").slice(0, 300),
        })),
      });
      if (error) console.error("export log", error.message);
    }

    return NextResponse.json({
      commitUrl: pushed.commitUrl,
      branchUrl: `https://github.com/${repo}/tree/${branch.split("/").map(encodeURIComponent).join("/")}`,
      branchCreated: pushed.created,
      pullRequest: pr,
    });
  } catch (e) {
    const status = (e as { status?: number }).status;
    const text = (e as Error).message ?? "";
    if (status === 403 || /not accessible by integration/i.test(text))
      return fail(
        "Realframe can't write to that repository yet. Approve its new permissions in GitHub, then try again.",
        403,
        {
          code: "github_permission",
          settingsUrl: installationSettingsUrl(installationId, {
            login: install.account_login,
            type: install.account_type,
          }),
        },
      );
    if (status === 404)
      return fail(
        "Realframe can't see that repository. Add it to the app's repository access in GitHub.",
        404,
        {
          code: "github_repo",
          settingsUrl: installationSettingsUrl(installationId, {
            login: install.account_login,
            type: install.account_type,
          }),
        },
      );
    if (status === 409) return fail(text || "That repository is empty.", 409);
    if (status === 422)
      return fail(
        "GitHub refused the push. If the branch moved, try a new branch name.",
        422,
      );
    console.error("github push", text);
    return fail("The push didn't finish. Try again.", 502);
  }
}
