import { describe, expect, it } from "vitest";
import {
  cleanHtml,
  componentName,
  estimateMicros,
  parseFiles,
  partFiles,
  slugify,
  splitHtml,
} from "@/lib/export";

const DOC = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>body{margin:0}</style>
<style media="print">nav{display:none}</style>
<script type="application/ld+json">{"a":1}</script>
</head>
<body>
<nav data-rf="r1" class="nav">Hi</nav>
<main data-rf="r2"><p data-rf-hidden data-rf="r3">Body</p></main>
<style data-rf-edits>.x{color:red}</style>
<script>var a = 1;</script>
<script src="https://cdn.example.com/lib.js"></script>
<script>console.log(a);</script>
<script type="module">import x from "y"; x();</script>
</body>
</html>`;

describe("cleanHtml", () => {
  it("drops Realframe ids and marks and keeps everything else", () => {
    const out = cleanHtml(DOC);
    expect(out).not.toMatch(/data-rf/);
    expect(out).toContain('<nav class="nav">Hi</nav>');
    expect(out).toContain("<style>.x{color:red}</style>");
  });
});

describe("splitHtml", () => {
  const files = splitHtml(DOC);
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

  it("links one stylesheet where the first style was, keeping media", () => {
    expect(Object.keys(byPath)).toEqual([
      "index.html",
      "styles.css",
      "app.js",
      "module-1.js",
    ]);
    expect(
      byPath["index.html"].match(/<link rel="stylesheet" href="styles.css">/g),
    ).toHaveLength(1);
    expect(byPath["index.html"]).not.toMatch(/<style/);
    expect(byPath["styles.css"]).toContain("body{margin:0}");
    expect(byPath["styles.css"]).toContain(
      "@media print {\nnav{display:none}\n}",
    );
    expect(byPath["styles.css"]).toContain(".x{color:red}");
  });

  it("joins plain scripts into app.js where the last one was, in order", () => {
    expect(byPath["app.js"]).toBe("var a = 1;\n\n;\n\nconsole.log(a);\n");
    const html = byPath["index.html"];
    expect(html.indexOf("cdn.example.com")).toBeLessThan(
      html.indexOf('src="app.js"'),
    );
    expect(html.match(/src="app.js"/g)).toHaveLength(1);
  });

  it("keeps JSON and external scripts inline and gives modules their own file", () => {
    expect(byPath["index.html"]).toContain(
      '<script type="application/ld+json">{"a":1}</script>',
    );
    expect(byPath["index.html"]).toContain(
      '<script type="module" src="module-1.js"></script>',
    );
  });
});

describe("parts and names", () => {
  it("writes the fragment, its CSS and a preview page", () => {
    const files = partFiles({
      name: "Crew plan card",
      html: '<div data-rf="r9" class="card">Crew</div>',
      css: ".card{padding:22px}",
      fonts: [
        "https://fonts.googleapis.com/css2?family=Inter",
        "javascript:alert(1)",
      ],
    });
    expect(files.map((f) => f.path)).toEqual([
      "crew-plan-card.html",
      "crew-plan-card.css",
      "preview.html",
    ]);
    expect(files[0].content).toBe('<div class="card">Crew</div>\n');
    expect(files[2].content).toContain("fonts.googleapis.com");
    expect(files[2].content).not.toContain("javascript:");
  });

  it("makes file and component names", () => {
    expect(slugify("Fieldnote — Pricing!")).toBe("fieldnote-pricing");
    expect(slugify("***")).toBe("prototype");
    expect(componentName("Crew plan card")).toBe("CrewPlanCard");
    expect(componentName("123")).toBe("Component");
  });
});

describe("parseFiles", () => {
  it("reads file blocks and refuses paths that escape the project", () => {
    const files = parseFiles(`Here you go.
<file path="src/App.tsx">
export default function App() {}
</file>
<file path="../etc/passwd">nope</file>
<file path="/abs.txt">nope</file>
<file path="README.md">
\`\`\`md
# Hi
\`\`\`
</file>
<file path="src/App.tsx">dupe</file>`);
    expect(files).toEqual([
      { path: "src/App.tsx", content: "export default function App() {}\n" },
      { path: "README.md", content: "# Hi\n" },
    ]);
  });
});

describe("estimate", () => {
  it("is free for file formats and scales with the source for AI ones", () => {
    expect(estimateMicros("zip", 40_000)).toBe(0);
    const small = estimateMicros("part-react", 2_000);
    const big = estimateMicros("react", 40_000);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small * 10);
  });
});

describe("GitHub push names", () => {
  it("keeps paths, folders and branches safe", async () => {
    const { safePath, safeFolder, safeBranch, exportBranch } =
      await import("@/lib/export");
    expect(safePath("src/App.tsx")).toBe("src/App.tsx");
    expect(safePath("./index.html")).toBe("index.html");
    for (const bad of [
      "../x",
      "/abs",
      "a\\b",
      "a//b",
      ".git/config",
      "x/.git/y",
    ])
      expect(safePath(bad)).toBeNull();
    expect(safeFolder("/web/export/")).toBe("web/export");
    expect(safeFolder("")).toBe("");
    expect(safeFolder("../up")).toBeNull();
    expect(safeBranch("realframe/trip-v3")).toBe("realframe/trip-v3");
    for (const bad of [
      "",
      "a..b",
      "x.lock",
      "-x",
      "a/",
      "a//b",
      "a/.b",
      "has space",
    ])
      expect(safeBranch(bad)).toBeNull();
    expect(exportBranch("Trip Planner", 3)).toBe("realframe/trip-planner-v3");
    expect(exportBranch("Trip Planner", 3, "Pricing card")).toBe(
      "realframe/trip-planner-v3-pricing-card",
    );
  });
});
