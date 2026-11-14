import "server-only";
import { listRepoTree, readRepoFile } from "@/lib/github/app";

export type Detected = {
  framework: string;
  hostable: boolean;
  reason?: string;
  installCommand: string | null;
  buildCommand: string | null;
  outputDir: string;
  folders: string[];
};

const join = (dir: string, file: string) =>
  dir ? `${dir.replace(/\/+$/, "")}/${file}` : file;

/** Guesses how to build a folder of a repository, reading files through the API (no clone). */
export async function detectBuild(
  token: string,
  repo: string,
  ref: string,
  rootDir: string,
): Promise<Detected> {
  const tree = await listRepoTree(token, repo, ref).catch(() => [] as string[]);
  const folders = tree
    .filter((p) => p.endsWith("package.json") && !p.includes("node_modules/"))
    .map((p) => p.slice(0, -"package.json".length).replace(/\/$/, ""))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 50);

  const has = (file: string) =>
    tree.includes(join(rootDir, file)) || tree.includes(file);
  const pkgText = await readRepoFile(
    token,
    repo,
    join(rootDir, "package.json"),
    ref,
  );

  if (!pkgText) {
    const hasIndex = tree.includes(join(rootDir, "index.html"));
    return {
      framework: "Static HTML",
      hostable: hasIndex,
      reason: hasIndex
        ? undefined
        : "There's no package.json or index.html in this folder.",
      installCommand: null,
      buildCommand: null,
      outputDir: rootDir || ".",
      folders,
    };
  }

  let pkg: {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {};
  try {
    pkg = JSON.parse(pkgText);
  } catch {
    return {
      framework: "Unknown",
      hostable: false,
      reason: "package.json couldn't be read.",
      installCommand: null,
      buildCommand: null,
      outputDir: "dist",
      folders,
    };
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const scripts = pkg.scripts ?? {};

  // Package manager from the lockfile (in the folder or at the repo root for workspaces).
  const installCommand = has("pnpm-lock.yaml")
    ? "pnpm install --frozen-lockfile"
    : has("yarn.lock")
      ? "yarn install --immutable"
      : has("bun.lockb") || has("bun.lock")
        ? "bun install --frozen-lockfile"
        : has("package-lock.json")
          ? "npm ci"
          : "npm install";
  const run = installCommand.split(" ")[0];
  const buildCommand = scripts.build
    ? `${run === "npm" ? "npm run" : run} build`
    : null;

  let framework = "Node";
  let outputDir = "dist";
  let hostable = Boolean(buildCommand);
  let reason: string | undefined = buildCommand
    ? undefined
    : "package.json has no build script.";

  if (deps.next) {
    framework = "Next.js";
    outputDir = "out";
    const configText =
      (await readRepoFile(token, repo, join(rootDir, "next.config.js"), ref)) ??
      (await readRepoFile(
        token,
        repo,
        join(rootDir, "next.config.mjs"),
        ref,
      )) ??
      (await readRepoFile(token, repo, join(rootDir, "next.config.ts"), ref)) ??
      "";
    if (!/output\s*:\s*["']export["']/.test(configText)) {
      hostable = false;
      reason =
        "This Next.js app needs a server. Realframe hosts static builds: add output: 'export' to next.config to build it statically.";
    }
  } else if (deps["@remix-run/react"] || deps["@react-router/dev"]) {
    framework = "Remix / React Router";
    outputDir = "build/client";
  } else if (deps["@sveltejs/kit"]) {
    framework = "SvelteKit";
    outputDir = "build";
    if (!deps["@sveltejs/adapter-static"]) {
      hostable = false;
      reason =
        "This SvelteKit app needs a server. Use @sveltejs/adapter-static to build it statically.";
    }
  } else if (deps.astro) {
    framework = "Astro";
  } else if (deps["react-scripts"]) {
    framework = "Create React App";
    outputDir = "build";
  } else if (deps.vite) {
    framework = deps.react
      ? "Vite + React"
      : deps.vue
        ? "Vite + Vue"
        : deps.svelte
          ? "Vite + Svelte"
          : "Vite";
  } else if (deps["@angular/core"]) {
    framework = "Angular";
    outputDir = "dist";
  }

  return {
    framework,
    hostable,
    reason,
    installCommand,
    buildCommand,
    outputDir,
    folders,
  };
}
