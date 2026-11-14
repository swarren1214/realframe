import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import {
  installationToken,
  listRepoTree,
  readRepoFile,
  getCommit,
} from "@/lib/github/app";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DesignSystemSource, Runtime } from "./types";

/** What an import reads: text files, PDFs for the model to read, and how to load real components. */
export type Material = {
  files: { path: string; text: string }[];
  pdfs: { name: string; base64: string }[];
  runtime: Runtime | null;
  sha: string | null;
  notes: string[];
};

const MAX_FILE = 40_000;
const BUDGET = 260_000;

/** Which files describe a design system, best first. */
function score(path: string): number {
  const p = path.toLowerCase();
  if (/(^|\/)(node_modules|dist|build|\.next|coverage|\.git)\//.test(p))
    return -1;
  if (
    /\.(test|spec|stories)\.[jt]sx?$/.test(p) ||
    /__tests__|__mocks__/.test(p)
  )
    return -1;
  if (
    /(^|\/)(tokens?|design-tokens|theme)\/.*\.json$/.test(p) ||
    /tokens?\.(json|ts|js)$/.test(p)
  )
    return 100;
  if (
    /tailwind\.(config|preset)\.[cm]?[jt]s$/.test(p) ||
    /tailwind.*preset/.test(p)
  )
    return 95;
  if (/(^|\/)(theme|tokens|variables|globals|base|index)\.(css|scss)$/.test(p))
    return 90;
  if (/(^|\/)readme\.mdx?$/.test(p)) return 85;
  if (/(^|\/)package\.json$/.test(p)) return 80;
  if (/(^|\/)(docs?|guidelines?|foundations?)\/.*\.mdx?$/.test(p)) return 70;
  if (/(^|\/)components?\/.*\.(tsx|jsx|vue|svelte)$/.test(p)) return 60;
  if (/\.d\.ts$/.test(p) && /component|index/.test(p)) return 55;
  if (/\.(css|scss)$/.test(p)) return 40;
  if (/\.mdx?$/.test(p)) return 30;
  return -1;
}

function pick(paths: string[], limit = 140) {
  return paths
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.length - b.p.length)
    .slice(0, limit)
    .map((x) => x.p);
}

function within(budget: { left: number }, text: string) {
  const t =
    text.length > MAX_FILE
      ? `${text.slice(0, MAX_FILE)}\n/* …truncated… */`
      : text;
  if (budget.left <= 0) return null;
  budget.left -= t.length;
  return t;
}

async function fromGitHub(
  src: Extract<DesignSystemSource, { kind: "github" }>,
): Promise<Material> {
  const token = await installationToken(src.installationId);
  const ref = src.branch;
  const [tree, commit] = await Promise.all([
    listRepoTree(token, src.repo, ref),
    getCommit(token, src.repo, ref),
  ]);
  const root = src.folder.replace(/^\.?\/*/, "").replace(/\/+$/, "");
  const inFolder = tree.filter(
    (p) => !root || p === root || p.startsWith(`${root}/`),
  );
  const chosen = pick(inFolder);
  // The repo's own README and root tokens help even when a folder is picked.
  for (const extra of ["README.md", "package.json"])
    if (root && tree.includes(extra) && !chosen.includes(extra))
      chosen.push(extra);
  const budget = { left: BUDGET };
  const files: Material["files"] = [];
  for (let i = 0; i < chosen.length && budget.left > 0; i += 8) {
    const batch = await Promise.all(
      chosen
        .slice(i, i + 8)
        .map(async (p) => ({
          p,
          t: await readRepoFile(token, src.repo, p, commit.sha),
        })),
    );
    for (const { p, t } of batch) {
      const text = t && within(budget, t);
      if (text) files.push({ path: p, text });
    }
  }
  const componentFiles = inFolder.filter(
    (p) => /(^|\/)components?\/.*\.(tsx|jsx)$/.test(p) && score(p) > 0,
  ).length;
  return {
    files,
    pdfs: [],
    runtime: null,
    sha: commit.sha,
    notes: [
      `Repository ${src.repo} at ${commit.sha.slice(0, 7)}${root ? `, folder ${root}` : ""}.`,
      `${componentFiles} component source files found; ${files.length} files read.`,
    ],
  };
}

type NpmMeta = {
  "dist-tags": Record<string, string>;
  versions: Record<string, { peerDependencies?: Record<string, string> }>;
};

async function fromNpm(
  src: Extract<DesignSystemSource, { kind: "npm" }>,
): Promise<Material> {
  const name = src.package.trim();
  if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name))
    throw new Error("That doesn't look like an npm package name.");
  const metaRes = await fetch(
    `https://registry.npmjs.org/${name.replace("/", "%2F")}`,
    { headers: { accept: "application/json" } },
  );
  if (metaRes.status === 404)
    throw new Error(
      `${name} isn't on npm (private packages can be imported from GitHub).`,
    );
  if (!metaRes.ok)
    throw new Error(`npm answered ${metaRes.status} for ${name}.`);
  const meta = (await metaRes.json()) as NpmMeta;
  const version =
    src.version?.trim() && src.version !== "latest"
      ? src.version.trim()
      : meta["dist-tags"].latest;
  if (!meta.versions[version])
    throw new Error(`${name} has no version ${version}.`);

  const listing = await fetch(
    `https://data.jsdelivr.com/v1/packages/npm/${name}@${version}?structure=flat`,
  );
  if (!listing.ok)
    throw new Error(`Couldn't list the files in ${name}@${version}.`);
  const all = (
    (await listing.json()) as { files: { name: string }[] }
  ).files.map((f) => f.name.replace(/^\//, ""));
  // Packages ship built code; their type declarations describe the components and props.
  const wanted = [
    ...all.filter((p) => /^(readme\.md|package\.json)$/i.test(p)),
    ...all
      .filter(
        (p) => /\.d\.ts$/.test(p) && !/internal|private|utils?\//i.test(p),
      )
      .slice(0, 80),
    ...all
      .filter((p) => /\.css$/.test(p) && !/\.min\.css$/.test(p))
      .slice(0, 6),
    ...all.filter((p) => /tokens?.*\.json$/i.test(p)).slice(0, 6),
  ];
  const budget = { left: BUDGET };
  const files: Material["files"] = [];
  for (let i = 0; i < wanted.length && budget.left > 0; i += 10) {
    const batch = await Promise.all(
      wanted.slice(i, i + 10).map(async (p) => {
        const r = await fetch(
          `https://cdn.jsdelivr.net/npm/${name}@${version}/${p}`,
        );
        return { p, t: r.ok ? await r.text() : null };
      }),
    );
    for (const { p, t } of batch) {
      const text = t && within(budget, t);
      if (text) files.push({ path: p, text });
    }
  }
  const pkg = JSON.parse(
    files.find((f) => f.path === "package.json")?.text ?? "{}",
  ) as { style?: string; peerDependencies?: Record<string, string> };
  const peers = Object.keys(
    meta.versions[version].peerDependencies ?? pkg.peerDependencies ?? {},
  );
  const isReact = peers.includes("react");
  const css =
    src.stylesheet?.trim() ||
    pkg.style ||
    all.find((p) => /^dist\/.*(style|index|main)[^/]*\.css$/.test(p)) ||
    all.find((p) => /\.css$/.test(p) && !/\.min\.css$/.test(p)) ||
    null;
  const runtime: Runtime | null = isReact
    ? {
        package: name,
        version,
        importMap: {
          react: "https://esm.sh/react@19.1.0",
          "react/jsx-runtime": "https://esm.sh/react@19.1.0/jsx-runtime",
          "react-dom": "https://esm.sh/react-dom@19.1.0",
          "react-dom/client": "https://esm.sh/react-dom@19.1.0/client",
          [name]: `https://esm.sh/${name}@${version}?external=react,react-dom`,
        },
        stylesheet: css
          ? `https://cdn.jsdelivr.net/npm/${name}@${version}/${css.replace(/^\.?\//, "")}`
          : null,
      }
    : null;
  return {
    files,
    pdfs: [],
    runtime,
    sha: version,
    notes: [
      `npm package ${name}@${version}.`,
      isReact
        ? "React components: prototypes can load them directly."
        : "Not a React package: styles only.",
    ],
  };
}

async function fromStorybook(
  src: Extract<DesignSystemSource, { kind: "storybook" }>,
): Promise<Material> {
  let base: URL;
  try {
    base = new URL(src.url);
  } catch {
    throw new Error(
      "Enter the Storybook's address, like https://storybook.example.com.",
    );
  }
  if (base.protocol !== "https:")
    throw new Error("Use an https:// Storybook address.");
  const root = base.href.replace(/\/(index\.html)?(\?.*)?$/, "/");
  let index: {
    entries?: Record<
      string,
      {
        title: string;
        name: string;
        type?: string;
        importPath?: string;
        tags?: string[];
      }
    >;
    stories?: Record<string, { title?: string; kind?: string; name: string }>;
  } | null = null;
  for (const file of ["index.json", "stories.json"]) {
    const r = await fetch(new URL(file, root), {
      headers: { accept: "application/json" },
    }).catch(() => null);
    if (r?.ok) {
      index = await r.json();
      break;
    }
  }
  if (!index)
    throw new Error(
      "Couldn't read that Storybook. It needs to be public, built with Storybook 6.4 or later.",
    );
  const entries = Object.values(index.entries ?? index.stories ?? {}) as {
    title?: string;
    kind?: string;
    name: string;
    type?: string;
    importPath?: string;
  }[];
  const byComponent = new Map<string, string[]>();
  for (const e of entries) {
    const title = e.title ?? e.kind ?? "";
    if (!title) continue;
    byComponent.set(title, [
      ...(byComponent.get(title) ?? []),
      `${e.type === "docs" ? "[docs] " : ""}${e.name}`,
    ]);
  }
  const listing = [...byComponent.entries()]
    .map(([t, names]) => `${t}: ${names.slice(0, 12).join(", ")}`)
    .join("\n");
  // Storybook's own CSS often carries the system's tokens.
  const files: Material["files"] = [
    { path: "storybook-index.txt", text: listing.slice(0, 60_000) },
  ];
  const html = await fetch(new URL("iframe.html", root))
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  const cssLinks = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)]
    .map((m) => m[1])
    .slice(0, 4);
  const budget = { left: 120_000 };
  for (const href of cssLinks) {
    const t = await fetch(new URL(href, root))
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    const text = t && within(budget, t);
    if (text) files.push({ path: href, text });
  }
  return {
    files,
    pdfs: [],
    runtime: null,
    sha: null,
    notes: [
      `Storybook at ${root}: ${byComponent.size} components, ${entries.length} stories.`,
    ],
  };
}

async function fromUpload(
  admin: SupabaseClient,
  src: Extract<DesignSystemSource, { kind: "upload" }>,
): Promise<Material> {
  const budget = { left: BUDGET };
  const files: Material["files"] = [];
  const pdfs: Material["pdfs"] = [];
  for (const path of src.paths) {
    const { data, error } = await admin.storage
      .from("design-systems")
      .download(path);
    if (error || !data)
      throw new Error(`Couldn't read ${path.split("/").pop()}.`);
    const name = path
      .split("/")
      .pop()!
      .replace(/^[0-9a-f-]{36}-/, "");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (/\.pdf$/i.test(name)) {
      if (pdfs.length < 3 && bytes.byteLength < 20_000_000)
        pdfs.push({ name, base64: Buffer.from(bytes).toString("base64") });
    } else if (/\.zip$/i.test(name)) {
      const unzipped = unzipSync(bytes);
      for (const p of pick(Object.keys(unzipped), 160)) {
        const text = within(budget, strFromU8(unzipped[p]));
        if (text) files.push({ path: `${name}/${p}`, text });
      }
    } else {
      const text = within(budget, strFromU8(bytes));
      if (text) files.push({ path: name, text });
    }
  }
  return {
    files,
    pdfs,
    runtime: null,
    sha: null,
    notes: [
      `Uploaded files: ${src.paths.map((p) => p.split("/").pop()).join(", ")}.`,
    ],
  };
}

export async function gather(
  admin: SupabaseClient,
  source: DesignSystemSource,
): Promise<Material> {
  switch (source.kind) {
    case "github":
      return fromGitHub(source);
    case "npm":
      return fromNpm(source);
    case "storybook":
      return fromStorybook(source);
    case "upload":
      return fromUpload(admin, source);
  }
}
