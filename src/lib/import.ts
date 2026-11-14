// Turns a single uploaded or pasted file into a prototype document.
//  - .html / .htm: used as is (a fragment is wrapped in a page).
//  - .jsx / .tsx / .js / .ts: a React component, wrapped in a page that loads React and
//    Tailwind and compiles the component in the browser. The original source stays readable
//    inside the page, so AI changes still work on it.

export const SINGLE_FILE_TYPES = [
  ".html",
  ".htm",
  ".jsx",
  ".tsx",
  ".js",
  ".ts",
];
export const MAX_SINGLE_FILE = 2_000_000;

export type ImportResult = {
  html: string;
  summary: string;
  warnings: string[];
};

const REACT_VERSION = "19.1.0";
const SHARED = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
]);

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function looksLikeReact(code: string) {
  return (
    /from\s+["']react["']|<\w[\w.]*[\s/>]|export\s+default/.test(code) &&
    !/^\s*<(!doctype|html)/i.test(code)
  );
}

export function importSingleFile(filename: string, raw: string): ImportResult {
  const name = filename.toLowerCase();
  const code = raw.replace(/^﻿/, "");
  if (!code.trim()) throw new Error("That file is empty.");
  if (code.length > MAX_SINGLE_FILE)
    throw new Error(
      "That file is over 2 MB. Upload a zip of the built app instead.",
    );
  const isHtml =
    name.endsWith(".html") ||
    name.endsWith(".htm") ||
    (!/\.(jsx|tsx|js|ts)$/.test(name) && !looksLikeReact(code));
  return isHtml ? fromHtml(code, filename) : fromReact(code, filename);
}

function fromHtml(code: string, filename: string): ImportResult {
  const warnings: string[] = [];
  let html = code;
  if (!/<html[\s>]/i.test(code)) {
    html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(
      filename.replace(/\.[^.]+$/, ""),
    )}</title>\n</head>\n<body>\n${code}\n</body>\n</html>\n`;
  }
  const local = [
    ...code.matchAll(
      /(?:src|href)\s*=\s*["'](?!https?:|data:|#|mailto:|tel:|\/\/|javascript:)([^"']+\.(?:css|js|png|jpe?g|gif|svg|webp|woff2?))["']/gi,
    ),
  ].map((m) => m[1]);
  if (local.length) {
    warnings.push(
      `This page links to ${local.length} local file${local.length === 1 ? "" : "s"} (like ${local[0]}) that weren't included. Upload the whole folder as a zip to keep them.`,
    );
  }
  return { html, summary: `Imported ${filename}.`, warnings };
}

function fromReact(code: string, filename: string): ImportResult {
  const warnings: string[] = [];
  let src = code;

  // Local imports can't be resolved from a single file.
  const localImports: string[] = [];
  src = src.replace(
    /^\s*import\s+(?:[^'"\n]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["'];?\s*$/gm,
    (_m, path: string) => {
      localImports.push(path);
      return "";
    },
  );
  const missingCode = localImports.filter(
    (p) => !/\.(css|scss|sass|less|svg|png|jpe?g|gif|webp)$/i.test(p),
  );
  if (missingCode.length) {
    throw new Error(
      `This file imports ${missingCode[0]}, which isn't included. Paste everything into one file, or upload the built app as a zip.`,
    );
  }
  if (localImports.length)
    warnings.push(
      `Skipped ${localImports.length} local stylesheet or image import${localImports.length === 1 ? "" : "s"}.`,
    );

  // Packages load from esm.sh; React itself comes from the import map so there's one copy.
  src = src.replace(
    /(\bfrom\s+|\bimport\s+|\bimport\s*\(\s*)(["'])([^"'.\/][^"']*)\2/g,
    (m, lead: string, q: string, spec: string) => {
      if (SHARED.has(spec) || spec.startsWith("https://")) return m;
      return `${lead}${q}https://esm.sh/${spec}?external=react,react-dom${q}`;
    },
  );

  // Find the component to render.
  let component: string | null = null;
  src = src.replace(
    /export\s+default\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    (_m, a = "", n: string) => {
      component = n;
      return `${a}function ${n}`;
    },
  );
  if (!component) {
    src = src.replace(
      /export\s+default\s+class\s+([A-Za-z_$][\w$]*)/,
      (_m, n: string) => {
        component = n;
        return `class ${n}`;
      },
    );
  }
  if (!component) {
    src = src.replace(
      /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m,
      (_m, n: string) => {
        component = n;
        return "";
      },
    );
  }
  if (!component && /export\s+default\s+/.test(src)) {
    src = src.replace(/export\s+default\s+/, "const __RealframeRoot = ");
    component = "__RealframeRoot";
  }
  if (!component) {
    const named = src.match(
      /(?:function|const|let|class)\s+(App|Prototype|Main|Page|Home)\b/,
    );
    if (named) component = named[1];
  }
  if (!component)
    throw new Error(
      "Couldn't find the component to show. Add `export default` to your main component.",
    );

  src += `\n\n// Added by Realframe: render the component.\nimport { createRoot as __rfCreateRoot } from "react-dom/client";\n__rfCreateRoot(document.getElementById("root")).render(<${component} />);\n`;

  const title = escapeHtml(filename.replace(/\.[^.]+$/, "") || "Prototype");
  const importMap = JSON.stringify(
    {
      imports: {
        react: `https://esm.sh/react@${REACT_VERSION}`,
        "react/jsx-runtime": `https://esm.sh/react@${REACT_VERSION}/jsx-runtime`,
        "react/jsx-dev-runtime": `https://esm.sh/react@${REACT_VERSION}/jsx-dev-runtime`,
        "react-dom": `https://esm.sh/react-dom@${REACT_VERSION}?external=react`,
        "react-dom/client": `https://esm.sh/react-dom@${REACT_VERSION}/client?external=react`,
      },
    },
    null,
    2,
  );

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script type="importmap">
${importMap}
</script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<!-- Component source (${escapeHtml(filename)}). Realframe compiles it in the browser. -->
<script type="text/plain" id="rf-source" data-filename="${escapeHtml(filename)}">
${src.replace(/<\/script/gi, "<\\/script")}
</script>
<script>
(function () {
  var el = document.getElementById("rf-source");
  try {
    var out = Babel.transform(el.textContent, {
      filename: "App.tsx",
      presets: [["typescript", { isTSX: true, allExtensions: true }], ["react", { runtime: "automatic" }]],
    }).code;
    var s = document.createElement("script");
    s.type = "module";
    s.textContent = out;
    document.body.appendChild(s);
  } catch (err) {
    var pre = document.createElement("pre");
    pre.style.cssText = "margin:16px;padding:16px;border-radius:12px;background:#fef2f2;color:#991b1b;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap";
    pre.textContent = "This component didn't compile:\\n\\n" + err.message;
    document.body.appendChild(pre);
  }
})();
</script>
</body>
</html>
`;
  return { html, summary: `Imported ${filename} (React component).`, warnings };
}
