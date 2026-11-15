// Export: turning a prototype version (or a part of it) into files people take elsewhere.
// Pure helpers shared by the Export dialog (browser) and the export routes (server).

export const EXPORT_FORMATS = [
  "html",
  "zip",
  "bundle",
  "react",
  "part-html",
  "part-react",
  "part-tailwind",
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportScope = "prototype" | "selection";

/** Formats an AI writes; they run as a build and bill like one. */
export const AI_FORMATS: ExportFormat[] = [
  "react",
  "part-react",
  "part-tailwind",
];

export const FORMAT_INFO: Record<
  ExportFormat,
  { scope: ExportScope; name: string; detail: string }
> = {
  html: {
    scope: "prototype",
    name: "Single HTML file",
    detail: "One file that opens anywhere",
  },
  zip: {
    scope: "prototype",
    name: "ZIP of HTML, CSS and JS",
    detail: "Inline styles and scripts split into their own files",
  },
  bundle: {
    scope: "prototype",
    name: "Original app files",
    detail: "The uploaded or GitHub build's files, as served",
  },
  react: {
    scope: "prototype",
    name: "React + Tailwind project",
    detail: "A Vite app split into components, with a README",
  },
  "part-html": {
    scope: "selection",
    name: "HTML + CSS",
    detail: "The element and only the CSS rules that apply to it",
  },
  "part-react": {
    scope: "selection",
    name: "React component",
    detail: "TypeScript + CSS module, with props for repeated content",
  },
  "part-tailwind": {
    scope: "selection",
    name: "Tailwind component",
    detail: "TypeScript + Tailwind classes, no stylesheet",
  },
};

export function readFormat(v: unknown): ExportFormat | null {
  return typeof v === "string" &&
    (EXPORT_FORMATS as readonly string[]).includes(v)
    ? (v as ExportFormat)
    : null;
}

export type ExportFile = { path: string; content: string };

/** A file-name-safe slug: "Fieldnote pricing" → "fieldnote-pricing". */
export function slugify(name: string, fallback = "prototype") {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || fallback;
}

/** "PricingCard" from "Crew plan card" or "button". */
export function componentName(label: string, fallback = "Component") {
  const words = label
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  const name = words
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join("");
  return /^[A-Z]/.test(name) ? name : fallback;
}

/**
 * The prototype as people should get it: no Realframe ids or editing marks, no injected
 * agent. The document is otherwise left byte for byte.
 */
export function cleanHtml(html: string) {
  return html
    .replace(/\s+data-rf(?:-[a-z-]+)?(?:="[^"]*"|='[^']*'|=[^\s>]+)?/g, "")
    .replace(
      /<style\b[^>]*\bdata-rf-edits\b[^>]*>([\s\S]*?)<\/style>/gi,
      "<style>$1</style>",
    )
    .replace(
      /<script\b[^>]*\bdata-realframe-agent\b[^>]*>[\s\S]*?<\/script>\s*/gi,
      "",
    );
}

const STYLE_RE = /<style\b([^>]*)>([\s\S]*?)<\/style>/gi;
// Classic and module scripts with a body and no src. JSON, importmaps and templates stay inline.
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/**
 * Splits a single-file prototype into index.html, styles.css and app.js. Inline <style>
 * blocks become one stylesheet linked where the first one was; plain inline scripts become
 * one script file loaded where the last one was (module scripts get their own files, since
 * they can't share scope). Anything else stays inline.
 */
export function splitHtml(html: string): ExportFile[] {
  const doc = cleanHtml(html);
  const css: string[] = [];
  let firstStyle = true;
  let out = doc.replace(STYLE_RE, (_m, attrs: string, body: string) => {
    if (/\bmedia\s*=/.test(attrs)) {
      const media = /\bmedia\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1] ?? "all";
      css.push(`@media ${media} {\n${body.trim()}\n}`);
    } else css.push(body.trim());
    if (firstStyle) {
      firstStyle = false;
      return '<link rel="stylesheet" href="styles.css">';
    }
    return "";
  });

  const classic: string[] = [];
  const modules: ExportFile[] = [];
  let lastClassicMarker = -1;
  let n = 0;
  out = out.replace(SCRIPT_RE, (m, attrs: string, body: string) => {
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) return m;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/
      .exec(attrs)?.[1]
      ?.toLowerCase();
    if (type === "module") {
      const path = `module-${modules.length + 1}.js`;
      modules.push({ path, content: body.trim() + "\n" });
      return `<script type="module" src="${path}"></script>`;
    }
    if (type && !/^(text|application)\/(javascript|ecmascript)$/.test(type))
      return m;
    classic.push(body.trim());
    lastClassicMarker = n++;
    return `<!--rf-script-${lastClassicMarker}-->`;
  });
  out = out.replace(/<!--rf-script-(\d+)-->/g, (_m, i: string) =>
    Number(i) === lastClassicMarker ? '<script src="app.js"></script>' : "",
  );

  const files: ExportFile[] = [{ path: "index.html", content: out }];
  if (css.length)
    files.push({ path: "styles.css", content: css.join("\n\n") + "\n" });
  if (classic.length)
    files.push({ path: "app.js", content: classic.join("\n\n;\n\n") + "\n" });
  return [...files, ...modules];
}

/** A selected part as files: the fragment, its stylesheet, and a page that previews both. */
export function partFiles(part: {
  name: string;
  html: string;
  css: string;
  fonts?: string[];
}): ExportFile[] {
  const base = slugify(part.name, "part");
  const html = cleanHtml(part.html).trim();
  const fonts = (part.fonts ?? [])
    .filter((u) => /^https:\/\//.test(u))
    .map((u) => `<link rel="stylesheet" href="${u.replace(/"/g, "&quot;")}">`)
    .join("\n");
  return [
    { path: `${base}.html`, content: html + "\n" },
    { path: `${base}.css`, content: part.css.trim() + "\n" },
    {
      path: "preview.html",
      content: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${part.name.replace(/[<&]/g, "")}</title>
${fonts ? fonts + "\n" : ""}<link rel="stylesheet" href="${base}.css">
</head>
<body>
${html}
</body>
</html>
`,
    },
  ];
}

/**
 * Reads the files an export model wrote, as <file path="…">…</file> blocks. Paths must be
 * relative, inside the project, and plain (no "..", no absolute paths, no backslashes).
 */
/** A plain relative path: no "..", no absolute paths, no backslashes. Null when unsafe. */
export function safePath(raw: string, max = 200) {
  const path = raw.trim().replace(/^\.\//, "");
  if (
    !path ||
    path.length > max ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((s) => s === ".." || s === "." || !s) ||
    !/^[\w.\-/@ ]+$/.test(path) ||
    /(^|\/)\.git(\/|$)/.test(path)
  )
    return null;
  return path;
}

/** A folder in a repo ("" for the root), cleaned of leading and trailing slashes. Null when unsafe. */
export function safeFolder(raw: string) {
  const folder = raw.trim().replace(/^\/+|\/+$/g, "");
  return folder === "" ? "" : safePath(folder, 120);
}

/** Git's branch-name rules, simplified to what Realframe needs. Null when invalid. */
export function safeBranch(raw: string) {
  const b = raw.trim();
  if (
    !b ||
    b.length > 100 ||
    !/^[A-Za-z0-9._\/-]+$/.test(b) ||
    b.startsWith("/") ||
    b.endsWith("/") ||
    b.startsWith("-") ||
    b.endsWith(".") ||
    b.endsWith(".lock") ||
    b.includes("..") ||
    b.includes("//") ||
    b.split("/").some((s) => s.startsWith("."))
  )
    return null;
  return b;
}

/** The suggested branch for an export: realframe/<prototype>-v<n>, or -<part> for a selection. */
export function exportBranch(
  projectName: string,
  version: number,
  part?: string,
) {
  const base = `realframe/${slugify(projectName)}-v${version}`;
  return part ? `${base}-${slugify(part, "part").slice(0, 30)}` : base;
}

export function parseFiles(text: string): ExportFile[] {
  const files: ExportFile[] = [];
  const seen = new Set<string>();
  const re = /<file\s+path="([^"]+)">\n?([\s\S]*?)\n?<\/file>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const path = safePath(m[1]);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    // Models sometimes fence the file body; the fence isn't part of the file.
    const body = m[2].replace(/^```[\w-]*\n([\s\S]*?)\n```$/, "$1");
    files.push({ path, content: body.endsWith("\n") ? body : body + "\n" });
  }
  return files;
}

/** Rough tokens for a text: about four characters a token. */
export const roughTokens = (s: string) => Math.ceil(s.length / 4);

/** What an AI export is likely to cost, in billed micros, before it runs. */
export function estimateMicros(
  format: ExportFormat,
  sourceChars: number,
  rates = { inputPerMtok: 3, outputPerMtok: 15, markup: 1.5 },
) {
  if (!AI_FORMATS.includes(format)) return 0;
  const input = Math.ceil(sourceChars / 4) + 1500;
  // A React project rewrites the whole page plus scaffolding; a component is about its source.
  const output = Math.ceil(
    (sourceChars / 4) * (format === "react" ? 1.4 : 1.2) +
      (format === "react" ? 1200 : 300),
  );
  return Math.ceil(
    (input * rates.inputPerMtok + output * rates.outputPerMtok) * rates.markup,
  );
}
