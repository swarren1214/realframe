import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Material } from "./gather";
import type { ComponentSpec, Tokens } from "./types";

export type Extracted = {
  tokens: Tokens;
  components: ComponentSpec[];
  rules: string[];
  summary: string;
};

const PROMPT = `You are reading a product team's design system so an AI prototyping tool can build screens that look and behave like the team's real product.

From the material below, extract:
1. tokens: the actual values. Colors (with names as the system uses them, and what each is for), font families (with a Google Fonts or CSS source if you can tell), the type scale, corner radii, spacing steps and shadows. Use real values from the files; don't invent any. Skip what isn't there.
2. components: up to 60 of the system's components (skip internal helpers). For each: name, one-line description, important props or variants, and a short example.
   - REAL_COMPONENTS mode: the example is JSX using the package's real exports, e.g. <Button variant="primary">Save</Button>.
   - STYLES mode: the example is plain HTML with Tailwind classes that reproduces the component's look from its source (exact colors as arbitrary values like bg-[#2563EB], radius, padding, font weight).
3. rules: 5 to 15 short, specific usage rules a designer on this team would follow, taken from the docs and code (when to use which variant, spacing, density, tone of copy, accessibility). Only rules the material supports.
4. summary: one sentence describing the system's look and feel.

Respond with only this, valid JSON inside the tags:
<json>{"summary": "...", "tokens": {"colors": [{"name": "", "value": "", "usage": ""}], "fonts": [{"role": "", "family": "", "source": ""}], "typeScale": [{"name": "", "size": "", "weight": "", "lineHeight": ""}], "radii": [{"name": "", "value": ""}], "spacing": [{"name": "", "value": ""}], "shadows": [{"name": "", "value": ""}]}, "components": [{"name": "", "description": "", "props": [""], "example": ""}], "rules": [""]}</json>`;

function clip<T>(xs: unknown, n: number): T[] {
  return Array.isArray(xs) ? (xs.slice(0, n) as T[]) : [];
}

export async function extract(
  material: Material,
  opts: { name: string; realComponents: boolean; packageName?: string },
): Promise<Extracted> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const client = new Anthropic({ apiKey });
  const model =
    process.env.REALFRAME_EXTRACT_MODEL ||
    process.env.REALFRAME_CODEGEN_MODEL ||
    "claude-sonnet-5-5";

  const mode = opts.realComponents
    ? `REAL_COMPONENTS mode: prototypes import components from the npm package "${opts.packageName}".`
    : "STYLES mode: prototypes can't load this code, so examples must be HTML + Tailwind.";
  const files = material.files
    .map((f) => `<file path="${f.path}">\n${f.text}\n</file>`)
    .join("\n\n");
  const content: Anthropic.ContentBlockParam[] = [
    ...material.pdfs.map((p): Anthropic.ContentBlockParam => ({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: p.base64 },
      title: p.name,
    })),
    {
      type: "text",
      text: `${PROMPT}\n\nDesign system: ${opts.name}\n${mode}\n${material.notes.join("\n")}\n\n<material>\n${files || "(no text files; see the attached documents)"}\n</material>`,
    },
  ];

  const stream = client.messages.stream({
    model,
    max_tokens: 24000,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  const text = message.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const raw =
    text.match(/<json>([\s\S]*?)<\/json>/)?.[1] ??
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: {
    summary?: string;
    tokens?: Tokens;
    components?: ComponentSpec[];
    rules?: string[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Couldn't make sense of this design system. Try pointing at the folder with its components or tokens.",
    );
  }
  const t = parsed.tokens ?? {};
  const tokens: Tokens = {
    colors: clip(t.colors, 80),
    fonts: clip(t.fonts, 6),
    typeScale: clip(t.typeScale, 16),
    radii: clip(t.radii, 12),
    spacing: clip(t.spacing, 16),
    shadows: clip(t.shadows, 8),
  };
  const components = clip<ComponentSpec>(parsed.components, 60).filter(
    (c) => c && typeof c.name === "string" && c.name.trim(),
  );
  const rules = clip<string>(parsed.rules, 20)
    .filter((r) => typeof r === "string" && r.trim())
    .map((r) => r.trim().slice(0, 500));
  if (!components.length && !(tokens.colors?.length ?? 0)) {
    throw new Error(
      "Didn't find any components or tokens there. Check the folder, package or files.",
    );
  }
  return {
    tokens,
    components,
    rules,
    summary: (parsed.summary ?? "").slice(0, 300),
  };
}
