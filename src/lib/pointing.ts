/**
 * Point and prompt: elements someone picked in the preview, sent along with a
 * request so "make this sticky" has an exact target.
 */
export type PointedElement = {
  label: string;
  tag: string;
  selector: string;
  html: string;
};

export const MAX_POINTED = 5;

/** Keep only well-formed targets, trimmed to sane sizes. */
export function readPointed(raw: unknown): PointedElement[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t) => {
      const o = t as Record<string, unknown>;
      return {
        label: String(o.label ?? "")
          .trim()
          .slice(0, 60),
        tag: String(o.tag ?? "")
          .trim()
          .slice(0, 20),
        selector: String(o.selector ?? "")
          .trim()
          .slice(0, 300),
        html: String(o.html ?? "").slice(0, 2000),
      };
    })
    .filter((t) => t.selector && t.tag)
    .slice(0, MAX_POINTED);
}

/** A short name for a chip or the chat: "Pay button", "Order summary". */
export function pointedName(t: Pick<PointedElement, "label" | "tag">) {
  const kind: Record<string, string> = {
    button: "button",
    a: "link",
    input: "field",
    textarea: "field",
    select: "menu",
    img: "image",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    nav: "navigation",
    header: "header",
    footer: "footer",
    form: "form",
    ul: "list",
    ol: "list",
    li: "item",
    table: "table",
  };
  const words = t.label
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
  const k = kind[t.tag] ?? "";
  if (words && k) return `${words} ${k}`;
  return words || k || `<${t.tag}>`;
}

/** What the build sees: the request, then the elements it's about. */
export function promptWithPointed(prompt: string, targets: PointedElement[]) {
  if (!targets.length) return prompt;
  const els = targets
    .map(
      (t, i) =>
        `<element n="${i + 1}" selector="${t.selector.replace(/"/g, "'")}">\n${t.html}\n</element>`,
    )
    .join("\n");
  return `${prompt}\n\nThe person pointed at ${targets.length === 1 ? "this element" : "these elements"} in the current prototype. Apply the request to ${targets.length === 1 ? "it" : "them"}, and leave the rest of the page as it is unless the request says otherwise:\n${els}`;
}

/** What the chat shows for the request. */
export function messageWithPointed(prompt: string, targets: PointedElement[]) {
  if (!targets.length) return prompt;
  return `${prompt}\n\nPointing at: ${targets.map(pointedName).join(", ")}`;
}
