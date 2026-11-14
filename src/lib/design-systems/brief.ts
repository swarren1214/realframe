import type { ComponentSpec, DesignSystem, Rule, Tokens } from "./types";

const MAX = 28_000;

function list<T>(xs: T[] | undefined, fmt: (x: T) => string) {
  return (xs ?? []).map((x) => `- ${fmt(x)}`).join("\n");
}

function tokensText(t: Tokens) {
  const parts = [
    t.colors?.length &&
      `Colors:\n${list(t.colors, (c) => `${c.name}: ${c.value}${c.usage ? ` (${c.usage})` : ""}`)}`,
    t.fonts?.length &&
      `Fonts:\n${list(t.fonts, (f) => `${f.role}: ${f.family}${f.source ? ` (${f.source})` : ""}`)}`,
    t.typeScale?.length &&
      `Type scale:\n${list(t.typeScale, (s) => `${s.name}: ${s.size}${s.weight ? ` / ${s.weight}` : ""}${s.lineHeight ? ` / line-height ${s.lineHeight}` : ""}`)}`,
    t.radii?.length &&
      `Corner radii: ${t.radii.map((r) => `${r.name} ${r.value}`).join(", ")}`,
    t.spacing?.length &&
      `Spacing: ${t.spacing.map((r) => `${r.name} ${r.value}`).join(", ")}`,
    t.shadows?.length &&
      `Shadows:\n${list(t.shadows, (s) => `${s.name}: ${s.value}`)}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

function componentText(c: ComponentSpec) {
  return [
    `### ${c.name}${c.description ? ` — ${c.description}` : ""}`,
    c.props?.length ? `Props/variants: ${c.props.join("; ")}` : "",
    c.example ? `Example:\n${c.example}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** What a build is told about the project's design system. */
export function designSystemBrief(ds: DesignSystem, rules: Rule[]) {
  const active = rules.filter((r) => r.status === "active");
  const head =
    ds.kind === "components" && ds.runtime
      ? `This team designs with the "${ds.name}" design system, published as the npm package ${ds.runtime.package}@${ds.runtime.version}. Build with its REAL components:
- Write the UI as React. Add this import map to <head>:
<script type="importmap">${JSON.stringify({ imports: ds.runtime.importMap })}</script>
${ds.runtime.stylesheet ? `- Load its stylesheet: <link rel="stylesheet" href="${ds.runtime.stylesheet}">\n` : ""}- Load Babel standalone (<script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script>) and put your code in <script type="text/babel" data-type="module" data-presets="react">, importing from "${ds.runtime.package}", "react" and "react-dom/client", then render into a root element.
- Use the system's components for everything they cover. Only hand-build what it doesn't provide, matching its tokens. You may still use Tailwind for layout.`
      : `This team designs with the "${ds.name}" design system. Prototypes can't load its code, so recreate its look exactly: use its colors (as Tailwind arbitrary values), fonts, type scale, radii, spacing and shadows, and build components to match the examples below. Don't introduce colors or fonts it doesn't have.`;
  const sections = [
    head,
    ds.summary ? `Look and feel: ${ds.summary}` : "",
    `## Tokens\n${tokensText(ds.tokens)}`,
    active.length
      ? `## Rules the team follows (always apply these)\n${active.map((r) => `- ${r.body}`).join("\n")}`
      : "",
  ].filter(Boolean);
  let out = sections.join("\n\n");
  // Components fill the remaining room, in the order they were found.
  const comps: string[] = [];
  for (const c of ds.components) {
    const t = componentText(c);
    if (out.length + comps.join("\n\n").length + t.length > MAX) break;
    comps.push(t);
  }
  if (comps.length) out += `\n\n## Components\n${comps.join("\n\n")}`;
  return out;
}
