// Visual editing: map clicks in the preview back to the prototype's source HTML.
//
// Every element that exists in the source document gets a stable `data-rf` id. Edits to
// those elements are written straight into the source (inline styles, text). Elements
// that the prototype's own JavaScript renders at runtime don't exist in the source, so
// their style edits go into a <style data-rf-edits> block, keyed by a selector anchored
// on the nearest element with a data-rf id. Their text can't be changed statically.

export type StyleMap = Record<string, string>;

export type ElementEdit = {
  key: string;
  rf: string | null;
  selector: string;
  styles: StyleMap;
  text?: string;
  label: string;
};

const SKIP = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
  "LINK",
  "META",
  "HEAD",
  "TITLE",
]);

function parse(html: string) {
  return new DOMParser().parseFromString(html, "text/html");
}

function serialize(doc: Document, original: string) {
  const doctype =
    /^\s*<!doctype[^>]*>/i.exec(original)?.[0] ?? "<!doctype html>";
  return `${doctype}\n${doc.documentElement.outerHTML}`;
}

function newId(used: Set<string>) {
  let id = "";
  do id = Math.random().toString(36).slice(2, 8);
  while (used.has(id));
  used.add(id);
  return id;
}

/** Give every static element under <body> a stable data-rf id (keeps existing ones). */
export function ensureIds(html: string) {
  const doc = parse(html);
  const used = new Set<string>();
  doc
    .querySelectorAll("[data-rf]")
    .forEach((el) => used.add(el.getAttribute("data-rf")!));
  let added = 0;
  doc.body?.querySelectorAll("*").forEach((el) => {
    if (
      SKIP.has(el.tagName) ||
      (el.closest("svg") !== null && el.tagName.toLowerCase() !== "svg")
    )
      return;
    if (!el.hasAttribute("data-rf")) {
      el.setAttribute("data-rf", newId(used));
      added++;
    }
  });
  return added ? serialize(doc, html) : html;
}

const toKebab = (prop: string) =>
  prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Write edits into the (id-tagged) source HTML. */
export function applyEdits(html: string, edits: ElementEdit[]) {
  const doc = parse(html);
  const rules: string[] = [];
  for (const edit of edits) {
    const el = edit.rf
      ? doc.querySelector(`[data-rf="${CSS.escape(edit.rf)}"]`)
      : null;
    if (el instanceof HTMLElement) {
      for (const [prop, value] of Object.entries(edit.styles))
        el.style.setProperty(toKebab(prop), value);
      if (typeof edit.text === "string") el.textContent = edit.text;
    } else if (Object.keys(edit.styles).length) {
      const body = Object.entries(edit.styles)
        .map(([p, v]) => `${toKebab(p)}: ${v} !important;`)
        .join(" ");
      rules.push(`${edit.selector} { ${body} }`);
    }
  }
  if (rules.length) {
    let block = doc.head.querySelector("style[data-rf-edits]");
    if (!block) {
      block = doc.createElement("style");
      block.setAttribute("data-rf-edits", "");
      doc.head.appendChild(block);
    }
    block.textContent =
      `${block.textContent ?? ""}\n${rules.join("\n")}`.trim();
  }
  return serialize(doc, html);
}

export function describeEdits(edits: ElementEdit[]) {
  const kinds = new Set<string>();
  for (const e of edits) {
    if (typeof e.text === "string") kinds.add("text");
    for (const p of Object.keys(e.styles)) {
      if (/color/i.test(p)) kinds.add("colors");
      else if (/font|line|letter|textAlign/.test(p)) kinds.add("type");
      else if (/padding|margin|gap/.test(p)) kinds.add("spacing");
      else if (/radius/.test(p)) kinds.add("corners");
      else if (p === "display") kinds.add("visibility");
      else kinds.add("size");
    }
  }
  const list = [...kinds];
  const what =
    list.length > 1
      ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`
      : (list[0] ?? "styles");
  return `Visual edit: changed ${what} on ${edits.length} element${edits.length === 1 ? "" : "s"}.`;
}

/** rgb()/rgba() → #rrggbb for <input type="color">. Transparent → null. */
export function toHex(color: string | undefined) {
  const m = color?.match(
    /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i,
  );
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) === 0) return null;
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

export const px = (v: string | undefined) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? Math.round(n) : 0;
};
