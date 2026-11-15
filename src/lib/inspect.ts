// Dev mode: map what's in the preview back to the source, and compare two versions' source.
import { parse } from "parse5";
import { diffLines } from "diff";

/** Where one source element starts and ends, 1-based lines. */
export type SourceSpan = { start: number; end: number; tag: string };

const SKIP = new Set([
  "html",
  "head",
  "script",
  "style",
  "template",
  "noscript",
  "title",
  "meta",
  "link",
  "base",
]);

type P5Node = {
  nodeName: string;
  tagName?: string;
  childNodes?: P5Node[];
  content?: P5Node;
  sourceCodeLocation?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    startTag?: { startOffset: number; endOffset: number; startLine: number };
    endTag?: { endLine: number };
  } | null;
};

/**
 * Marks every element written in the source with data-rf-src="n" (its index), inserting the
 * attribute straight into the original text so nothing else moves, and returns where each
 * element sits in the source. Elements the parser implies (a missing <tbody>) are skipped.
 */
export function annotateSource(html: string): {
  html: string;
  spans: SourceSpan[];
} {
  const doc = parse(html, {
    sourceCodeLocationInfo: true,
  }) as unknown as P5Node;
  const spans: SourceSpan[] = [];
  const inserts: { at: number; text: string }[] = [];
  const walk = (node: P5Node) => {
    for (const child of node.childNodes ?? []) {
      const tag = child.tagName;
      const loc = child.sourceCodeLocation;
      if (tag && loc?.startTag && !SKIP.has(tag)) {
        const open = html.slice(
          loc.startTag.startOffset,
          loc.startTag.endOffset,
        );
        const name = /^<([A-Za-z][\w:-]*)/.exec(open);
        if (name) {
          const n = spans.length;
          spans.push({
            start: loc.startLine,
            end: loc.endTag?.endLine ?? loc.endLine,
            tag,
          });
          inserts.push({
            at: loc.startTag.startOffset + name[0].length,
            text: ` data-rf-src="${n}"`,
          });
        }
      }
      if (tag !== "script" && tag !== "style")
        walk(
          child.tagName === "template" && child.content ? child.content : child,
        );
    }
  };
  walk(doc);
  let out = html;
  for (let i = inserts.length - 1; i >= 0; i--)
    out =
      out.slice(0, inserts[i].at) + inserts[i].text + out.slice(inserts[i].at);
  return { html: out, spans };
}

export type DiffRow = {
  kind: "same" | "add" | "del";
  a: number | null;
  b: number | null;
  text: string;
};

/** Line diff of two documents, with line numbers on both sides; unchanged runs fold. */
export function diffSource(before: string, after: string, context = 3) {
  const rows: DiffRow[] = [];
  let a = 1;
  let b = 1;
  // A missing final newline shouldn't make the last line look changed.
  const nl = (s: string) => (s.endsWith("\n") ? s : s + "\n");
  for (const part of diffLines(nl(before), nl(after))) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const text of lines) {
      if (part.added) rows.push({ kind: "add", a: null, b: b++, text });
      else if (part.removed) rows.push({ kind: "del", a: a++, b: null, text });
      else rows.push({ kind: "same", a: a++, b: b++, text });
    }
  }
  // Keep `context` unchanged lines around each change; fold the rest.
  const keep = rows.map(() => false);
  rows.forEach((r, i) => {
    if (r.kind === "same") return;
    for (
      let j = Math.max(0, i - context);
      j <= Math.min(rows.length - 1, i + context);
      j++
    )
      keep[j] = true;
  });
  const out: (DiffRow | { kind: "fold"; count: number })[] = [];
  for (let i = 0; i < rows.length;) {
    if (keep[i]) {
      out.push(rows[i++]);
      continue;
    }
    let j = i;
    while (j < rows.length && !keep[j]) j++;
    out.push({ kind: "fold", count: j - i });
    i = j;
  }
  return {
    rows: out,
    added: rows.filter((r) => r.kind === "add").length,
    removed: rows.filter((r) => r.kind === "del").length,
  };
}

/** What the preview reports about an inspected element. */
export type Inspected = {
  path: string;
  tag: string;
  id: string;
  cls: string;
  /** Its own source index, or null when a script rendered it. */
  src: number | null;
  /** The nearest source index at or above it. */
  nearestSrc: number | null;
  rect: { x: number; y: number; w: number; h: number };
  box: { margin: number[]; border: number[]; padding: number[] };
  styles: Record<string, string>;
  text: string;
};

export type TreeNode = {
  path: string;
  depth: number;
  tag: string;
  id: string;
  cls: string;
  text: string;
  kids: number;
  src: number | null;
};

export type TokenRow = { value: string; count: number };
export type Tokens = {
  colors: TokenRow[];
  fonts: TokenRow[];
  sizes: TokenRow[];
  radii: TokenRow[];
  spacing: TokenRow[];
  shadows: TokenRow[];
};

/** "rgb(15, 118, 110)" → "#0F766E"; leaves anything else (gradients, keywords) as it is. */
export function rgbToHex(v: string) {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(
    v.trim(),
  );
  if (!m) return v;
  const hex = [m[1], m[2], m[3]]
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const alpha =
    m[4] === undefined
      ? ""
      : Math.round(Number(m[4]) * 255)
          .toString(16)
          .padStart(2, "0")
          .toUpperCase();
  return `#${hex}${alpha === "FF" ? "" : alpha}`;
}

/** CSS for an inspected element, from its computed styles: what to paste into a stylesheet. */
export function cssFor(el: Pick<Inspected, "tag" | "cls" | "styles">) {
  const sel = el.cls ? `.${el.cls.trim().split(/\s+/).join(".")}` : el.tag;
  const lines = Object.entries(el.styles)
    .filter(
      ([, v]) =>
        v && v !== "none" && v !== "normal" && v !== "auto" && v !== "0px",
    )
    .map(
      ([k, v]) =>
        `  ${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`,
    );
  return `${sel} {\n${lines.join("\n")}\n}\n`;
}
