// Reads a zip of a built app in the browser and checks it before upload.
import { unzip } from "fflate";

export const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
export const MAX_BUNDLE_FILES = 1500;

export type BundleFile = { path: string; data: Uint8Array };

const IGNORE = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|\.git|node_modules)(\/|$)/;

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

/** Unzips, drops junk, strips a single wrapping folder (dist/, build/…) and checks it's a built site. */
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
  if (!paths.has("index.html")) {
    if (paths.has("package.json") || [...paths].some((p) => p.startsWith("src/"))) {
      throw new Error(
        "This looks like source code. Run your build (for example npm run build) and zip the output folder, usually dist or build.",
      );
    }
    throw new Error("There's no index.html at the top of the zip.");
  }
  const index = new TextDecoder().decode(files.find((f) => f.path === "index.html")!.data);
  if (/<script[^>]+src=["']\/?src\/main\.(t|j)sx?["']/i.test(index)) {
    throw new Error("This is a Vite project before it's built. Run npm run build and zip the dist folder.");
  }
  if (files.length > MAX_BUNDLE_FILES) throw new Error(`That's ${files.length} files; the limit is ${MAX_BUNDLE_FILES}.`);
  if (files.some((f) => f.path.split("/").some((s) => s === ".." || s === ""))) throw new Error("That zip has unsafe file paths.");

  const bytes = files.reduce((n, f) => n + f.data.byteLength, 0);
  if (bytes > MAX_BUNDLE_BYTES) throw new Error("Unzipped, that's over 25 MB.");
  return { files, bytes };
}
