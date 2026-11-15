import { describe, expect, it } from "vitest";
import { annotateSource, cssFor, diffSource, rgbToHex } from "@/lib/inspect";

const SRC = `<!doctype html>
<html lang="en">
<head><title>T</title><style>p{color:red}</style></head>
<body>
  <main class="m">
    <h1>Hi</h1>
    <table><tr><td>a</td></tr></table>
    <p
      class="multi">Two
lines</p>
  </main>
  <script>document.body.append(document.createElement('div'))</script>
</body>
</html>`;

describe("annotateSource", () => {
  const { html, spans } = annotateSource(SRC);

  it("marks only elements written in the source, leaving the text otherwise identical", () => {
    expect(html.replace(/ data-rf-src="\d+"/g, "")).toBe(SRC);
    expect(spans.map((s) => s.tag)).toEqual([
      "body",
      "main",
      "h1",
      "table",
      "tr",
      "td",
      "p",
    ]);
    expect(html).not.toMatch(/<tbody data-rf-src/);
    expect(html).toContain("<script>document.body.append");
  });

  it("records each element's first and last line", () => {
    const p = spans[spans.findIndex((s) => s.tag === "p")];
    expect(p).toEqual({ tag: "p", start: 8, end: 10 });
    expect(spans[1]).toEqual({ tag: "main", start: 5, end: 11 });
    expect(html).toContain('<main data-rf-src="1" class="m">');
  });
});

describe("diffSource", () => {
  it("numbers both sides and folds long unchanged runs", () => {
    const a = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    const b = a
      .replace("line 10", "line ten")
      .replace("line 20", "line 20\nline 21");
    const d = diffSource(a, b, 1);
    expect(d.added).toBe(2);
    expect(d.removed).toBe(1);
    expect(d.rows[0]).toEqual({ kind: "fold", count: 8 });
    expect(d.rows.find((r) => r.kind === "del")).toEqual({
      kind: "del",
      a: 10,
      b: null,
      text: "line 10",
    });
    expect(d.rows.at(-1)).toEqual({
      kind: "add",
      a: null,
      b: 21,
      text: "line 21",
    });
  });
});

describe("formatting", () => {
  it("turns computed colors into hex", () => {
    expect(rgbToHex("rgb(15, 118, 110)")).toBe("#0F766E");
    expect(rgbToHex("rgba(0, 0, 0, 0.5)")).toBe("#00000080");
    expect(rgbToHex("rgba(255, 255, 255, 1)")).toBe("#FFFFFF");
    expect(rgbToHex("transparent")).toBe("transparent");
  });

  it("writes CSS from computed styles, skipping defaults", () => {
    expect(
      cssFor({
        tag: "div",
        cls: "card featured",
        styles: { borderRadius: "14px", boxShadow: "none", paddingTop: "22px" },
      }),
    ).toBe(
      ".card.featured {\n  border-radius: 14px;\n  padding-top: 22px;\n}\n",
    );
  });
});

describe("canInspect", () => {
  it("always lets people with a role on the prototype inspect", async () => {
    const { canInspect } = await import("@/lib/types");
    for (const role of ["owner", "editor", "commenter", "viewer"] as const)
      expect(canInspect(role, { guest_inspect: false })).toBe(true);
  });
  it("lets guests and public visitors inspect only when allowed", async () => {
    const { canInspect } = await import("@/lib/types");
    expect(canInspect("guest", { guest_inspect: false })).toBe(false);
    expect(canInspect("public", {})).toBe(false);
    expect(canInspect("guest", { guest_inspect: true })).toBe(true);
    expect(canInspect("public", { guest_inspect: true })).toBe(true);
    expect(canInspect(null, { guest_inspect: true })).toBe(false);
  });
});
