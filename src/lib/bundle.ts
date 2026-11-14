// Reads a zip of a built app in the browser and checks it before upload.
import { unzip } from "fflate";

export const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
export const MAX_BUNDLE_FILES = 1500;

export type BundleFile = { path: string; data: Uint8Array };

export const IGNORE = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|\.git|node_modules)(\/|$)/;

const MIME: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  txt: "text/plain",
};

export function mimeFor(path: string) {
  return MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

function unzipAsync(buf: Uint8Array) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => unzip(buf, (err, out) => (err ? reject(err) : resolve(out))));
}

export type BuildSettings = { installCommand: string | null; buildCommand: string | null; outputDir: string; framework: string };

/** Source code we can build in the sandbox: package.json with a build script at the top of the zip. */
export class SourceZip extends Error {
  constructor(public settings: BuildSettings) {
    super("source");
  }
}

function guessBuild(files: BundleFile[]): BuildSettings | null {
  const paths = new Set(files.map((f) => f.path));
  const pkgFile = files.find((f) => f.path === "package.json");
  if (!pkgFile) return null;
  let pkg: { scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(new TextDecoder().decode(pkgFile.data));
  } catch {
    return null;
  }
  if (!pkg.scripts?.build) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const installCommand = paths.has("pnpm-lock.yaml")
    ? "pnpm install --frozen-lockfile"
    : paths.has("yarn.lock")
      ? "yarn install --immutable"
      : paths.has("bun.lockb") || paths.has("bun.lock")
        ? "bun install --frozen-lockfile"
        : paths.has("package-lock.json")
          ? "npm ci"
          : "npm install";
  const run = installCommand.split(" ")[0];
  const framework = deps.next
    ? "Next.js"
    : deps["react-scripts"]
      ? "Create React App"
      : deps.astro
        ? "Astro"
        : deps.vite
          ? deps.react
            ? "Vite + React"
            : "Vite"
          : "Node";
  const outputDir = deps.next ? "out" : deps["react-scripts"] ? "build" : "dist";
  return { installCommand, buildCommand: `${run === "npm" ? "npm run" : run} build`, outputDir, framework };
}

/**
 * Unzips, drops junk, strips a single wrapping folder (dist/, build/…) and checks it's a built site.
 * Throws SourceZip when the zip is an app's source that Realframe can build instead.
 */
export async function readBundle(file: File) {
  if (file.size > MAX_BUNDLE_BYTES) throw new Error("That zip is over 25 MB.");
  let entries: Record<string, Uint8Array>;
  try {
    entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("That zip couldn't be opened.");
  }
  let files: BundleFile[] = Object.entries(entries)
    .filter(([p]) => !p.endsWith("/") && !IGNORE.test(p))
    .map(([path, data]) => ({ path: path.replace(/^\.?\//, ""), data }));
  if (!files.length) throw new Error("That zip is empty.");

  // Strip one shared top folder, e.g. dist/index.html → index.html.
  while (files.every((f) => f.path.includes("/")) && new Set(files.map((f) => f.path.split("/")[0])).size === 1) {
    files = files.map((f) => ({ ...f, path: f.path.slice(f.path.indexOf("/") + 1) }));
  }

  const paths = new Set(files.map((f) => f.path));
  const index = paths.has("index.html") ? new TextDecoder().decode(files.find((f) => f.path === "index.html")!.data) : "";
  const unbuilt = !paths.has("index.html") || /<script[^>]+src=["']\/?src\/[^"']+\.(t|j)sx?["']/i.test(index);
  if (unbuilt && paths.has("package.json")) {
    const settings = guessBuild(files);
    if (settings) throw new SourceZip(settings);
    throw new Error("This looks like source code without a build script. Add one to package.json, or zip your built output folder.");
  }
  if (!paths.has("index.html")) throw new Error("There's no index.html at the top of the zip.");
  if (files.length > MAX_BUNDLE_FILES) throw new Error(`That's ${files.length} files; the limit is ${MAX_BUNDLE_FILES}.`);
  if (files.some((f) => f.path.split("/").some((s) => s === ".." || s === ""))) throw new Error("That zip has unsafe file paths.");

  const bytes = files.reduce((n, f) => n + f.data.byteLength, 0);
  if (bytes > MAX_BUNDLE_BYTES) throw new Error("Unzipped, that's over 25 MB.");
  return { files, bytes };
}
