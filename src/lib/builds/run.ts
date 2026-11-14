import "server-only";
import { createHmac } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCommit, installationToken } from "@/lib/github/app";
import { mimeFor } from "@/lib/bundle";

const MAX_FILES = 1500;
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_LOG = 300_000;
const BUILD_TIMEOUT_MS = 20 * 60_000;

// Registries and hosts a normal JavaScript install needs. Everything else is blocked,
// so a build script can't send code or data anywhere else.
const ALLOWED_HOSTS = [
  "github.com",
  "*.github.com",
  "codeload.github.com",
  "*.githubusercontent.com",
  "registry.npmjs.org",
  "*.npmjs.org",
  "registry.yarnpkg.com",
  "repo.yarnpkg.com",
  "*.yarnpkg.com",
  "nodejs.org",
  "*.nodejs.org",
  "bun.sh",
  "*.bun.sh",
];

export function runnerKey(buildId: string) {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "")
    .update(`builds:${buildId}`)
    .digest("hex");
}

/** Starts the runner for a queued build. The runner answers at once and builds in the background. */
export async function startRunner(buildId: string, origin: string) {
  const res = await fetch(`${origin}/api/builds/run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-realframe-key": runnerKey(buildId) },
    body: JSON.stringify({ buildId }),
  });
  if (!res.ok) throw new Error(`Couldn't start the build (${res.status}).`);
}

const ERROR_LINE = /(error|failed|cannot find|could not resolve|not found|ERR!)/i;

export async function runBuild(buildId: string) {
  const admin = createAdminClient();
  const { data: build } = await admin.from("builds").select("*").eq("id", buildId).maybeSingle();
  if (!build || build.status !== "queued") return;
  const { data: source } = await admin.from("project_sources").select("*").eq("project_id", build.project_id).maybeSingle();

  let log = "";
  let dirty = false;
  let lastErrorLine: string | null = null;
  const append = (text: string) => {
    for (const line of text.replace(/\r/g, "").split("\n")) {
      if (line && ERROR_LINE.test(line) && !lastErrorLine) lastErrorLine = line.trim().slice(0, 300);
    }
    log += text;
    if (log.length > MAX_LOG) log = "…earlier output trimmed…\n" + log.slice(-MAX_LOG);
    dirty = true;
  };
  const say = (line: string) => append(`${line}\n`);
  const flush = async () => {
    if (!dirty) return;
    dirty = false;
    await admin.from("builds").update({ log }).eq("id", buildId);
  };
  const ticker = setInterval(() => void flush(), 1000);

  const finish = async (fields: Record<string, unknown>) => {
    clearInterval(ticker);
    await admin
      .from("builds")
      .update({ ...fields, log, finished_at: new Date().toISOString() })
      .eq("id", buildId);
  };

  if (!source) {
    await finish({ status: "failed", error_summary: "This prototype isn't connected to a repository any more." });
    return;
  }

  const { data: claimed } = await admin
    .from("builds")
    .update({ status: "building", started_at: new Date().toISOString() })
    .eq("id", buildId)
    .eq("status", "queued")
    .select("id");
  if (!claimed?.length) {
    clearInterval(ticker);
    return;
  }

  let sandbox: Sandbox | null = null;
  try {
    const token = await installationToken(source.installation_id);
    const commit = build.commit_sha
      ? { sha: build.commit_sha as string, message: build.commit_message as string | null, author: build.commit_author as string | null }
      : await getCommit(token, source.repo_full_name, source.branch);
    await admin
      .from("builds")
      .update({ commit_sha: commit.sha, commit_message: commit.message, commit_author: commit.author })
      .eq("id", buildId);

    say(`$ git clone ${source.repo_full_name}@${commit.sha.slice(0, 7)} (${source.branch})`);
    sandbox = await Sandbox.create({
      source: {
        type: "git",
        url: `https://github.com/${source.repo_full_name}.git`,
        username: "x-access-token",
        password: token,
        depth: 1,
        revision: commit.sha,
      },
      image: "vercel/sandbox/node:22",
      resources: { vcpus: 4 },
      timeout: BUILD_TIMEOUT_MS,
      networkPolicy: { allow: ALLOWED_HOSTS },
      tags: { app: "realframe", build: buildId.slice(0, 32) },
    }).catch((err: unknown) => {
      const m = err instanceof Error ? err.message : String(err);
      if (/unauthori|forbidden|token|credential|oidc/i.test(m)) {
        throw new Error(
          `Vercel Sandbox isn't authorized for this project (${m}). Turn on OIDC for the Vercel project, or set VERCEL_TOKEN, VERCEL_TEAM_ID and VERCEL_PROJECT_ID.`,
        );
      }
      throw err;
    });
    await admin.from("builds").update({ sandbox_id: sandbox.name }).eq("id", buildId);
    say("Cloned.");

    const home = (await (await sandbox.runCommand("pwd")).stdout()).trim();
    const root = source.root_dir ? `${home}/${source.root_dir.replace(/^\/+|\/+$/g, "")}` : home;

    const sh = async (command: string, env: Record<string, string> = {}) => {
      say(`$ ${command}`);
      const cmd = await sandbox!.runCommand({ cmd: "bash", args: ["-lc", command], cwd: root, env, detached: true });
      for await (const line of cmd.logs()) append(line.data);
      const done = await cmd.wait();
      if (done.exitCode !== 0) throw new Error(`\`${command}\` exited with code ${done.exitCode}.`);
    };

    if (/^(pnpm|yarn)\b/.test(source.install_command ?? "")) {
      await sandbox.runCommand({ cmd: "corepack", args: ["enable"], sudo: true });
    }
    if (/^bun\b/.test(source.install_command ?? "")) {
      await sh("npm install -g bun --silent");
    }
    if (source.install_command) await sh(source.install_command, { CI: "1" });
    if (source.build_command) await sh(source.build_command, { CI: "1", NODE_ENV: "production" });

    // Collect the output.
    const outDir = `${root}/${(source.output_dir || ".").replace(/^\.\/?|\/+$/g, "")}`.replace(/\/$/, "");
    const listing = await sandbox.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        `cd "${outDir}" && find . -type f -not -path './node_modules/*' -not -path './.git/*' -printf '%s\\t%P\\n' | head -n ${MAX_FILES + 1}`,
      ],
    });
    if (listing.exitCode !== 0) throw new Error(`The output folder ${source.output_dir} wasn't created by the build.`);
    const files = (await listing.stdout())
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        const [size, path] = l.split("\t");
        return { size: Number(size), path };
      });
    if (!files.some((f) => f.path === "index.html")) throw new Error(`There's no index.html in ${source.output_dir}.`);
    if (files.length > MAX_FILES) throw new Error(`The build made more than ${MAX_FILES} files.`);
    const bytes = files.reduce((n, f) => n + f.size, 0);
    if (bytes > MAX_BYTES) throw new Error(`The build output is ${(bytes / 1048576).toFixed(1)} MB; the limit is 25 MB.`);

    say(`Uploading ${files.length} files (${(bytes / 1024).toFixed(0)} KB)…`);
    const bundleId = crypto.randomUUID();
    const base = `${build.project_id}/${bundleId}/`;
    const queue = [...files];
    const worker = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        const buf = await sandbox!.readFileToBuffer({ path: `${outDir}/${f.path}` });
        if (!buf) throw new Error(`Couldn't read ${f.path}.`);
        const { error } = await admin.storage.from("bundles").upload(base + f.path, buf, { contentType: mimeFor(f.path), upsert: false });
        if (error) throw new Error(`Couldn't upload ${f.path}: ${error.message}`);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));

    const { data: version, error } = await admin.rpc("create_build_version", {
      p_project: build.project_id,
      p_bundle: bundleId,
      p_files: files.length,
      p_bytes: bytes,
      p_summary: `Built ${commit.sha.slice(0, 7)} from ${source.branch}${commit.message ? `: ${commit.message}` : ""}`.slice(0, 300),
      p_sha: commit.sha,
      p_message: commit.message,
      p_author: commit.author,
      p_created_by: build.requested_by,
    });
    if (error || !version) throw new Error(error?.message ?? "Couldn't save the version.");
    const v = version as { id: string; number: number };

    if (build.trigger === "push" && source.publish_on_push) {
      await admin.from("projects").update({ live_version_id: v.id, published: true }).eq("id", build.project_id);
      say(`Published v${v.number}.`);
    }
    say(`Done: v${v.number}.`);
    await finish({ status: "succeeded", version_id: v.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    say(`\n${message}`);
    await finish({ status: "failed", error_summary: (lastErrorLine ?? message).slice(0, 300) });
  } finally {
    clearInterval(ticker);
    await sandbox?.stop().catch(() => {});
  }
  await startNextQueued(build.project_id);
}

/** After a build ends, start the newest build still waiting for the same prototype. */
async function startNextQueued(projectId: string) {
  const admin = createAdminClient();
  const { data: next } = await admin
    .from("builds")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "queued")
    .order("queued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!next) return;
  // Run it in this same function; the cron sweep picks up anything that's left behind.
  await runBuild(next.id);
}
