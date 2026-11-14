import Anthropic from "@anthropic-ai/sdk";

export const SYSTEM_PROMPT = `You are Realframe, an expert product designer and front-end engineer.
You build realistic, interactive, front-end-only prototypes that people can click through and share for review.

Output rules:
- Return ONE complete, self-contained HTML document (<!doctype html> ... </html>).
- Style with Tailwind CSS from <script src="https://cdn.tailwindcss.com"></script>. Google Fonts links are allowed.
- Use plain JavaScript in <script> tags. No build step, no imports from npm, no frameworks unless loaded from a CDN script tag.
- Front end only: all data is realistic mock data defined inline. Never call external APIs or send data anywhere.
- Make it genuinely interactive: buttons, tabs, forms, filters, modals and navigation should work with in-page state.
- For multi-screen flows, use simple hash routing inside the one document (#/screen-name) with working links.
- The page runs in a sandboxed iframe: do not use localStorage, sessionStorage, cookies, alert() or window.top.
- Use accessible markup (real buttons, labels, alt text), good contrast, and a responsive layout that works from 390px wide.
- Aim for polished, modern, credible product UI. No lorem ipsum.

When you are given an existing document, apply the requested change and return the FULL updated document,
keeping everything that was not asked to change.

Respond in exactly this format and nothing else:
<summary>One or two plain sentences describing what you built or changed.</summary>
<document>
...the complete HTML document...
</document>`;

export type GenerateInput = {
  prompt: string;
  /** Extra direction used to push variants apart. */
  variantHint?: string;
  currentHtml: string | null;
  history: { role: "user" | "assistant"; content: string }[];
};

export type GenerateResult = { html: string; summary: string };

export function parseResponse(text: string): GenerateResult {
  const summary = text.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.trim() ?? "Updated the prototype.";
  let html = text.match(/<document>([\s\S]*?)<\/document>/i)?.[1]?.trim() ?? "";
  if (!html) {
    const start = text.search(/<!doctype html|<html/i);
    const end = text.toLowerCase().lastIndexOf("</html>");
    if (start >= 0 && end > start) html = text.slice(start, end + 7);
  }
  html = html.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error("The model did not return a complete HTML document. Try again.");
  }
  return { html, summary };
}

export async function generatePrototype(
  input: GenerateInput,
): Promise<GenerateResult & { usage: { input: number | null; output: number | null } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const client = new Anthropic({ apiKey });
  const model = process.env.REALFRAME_CODEGEN_MODEL || "claude-sonnet-5-5";

  // The API needs the conversation to start with a user turn and alternate roles.
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of input.history.slice(-8)) {
    if (!m.content?.trim()) continue;
    if (history.length === 0 && m.role !== "user") continue;
    const last = history[history.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else history.push({ role: m.role, content: m.content });
  }
  if (history.length && history[history.length - 1].role === "user") history.pop();
  const request = input.currentHtml
    ? `Here is the current prototype:\n<current_document>\n${input.currentHtml}\n</current_document>\n\nRequested change: ${input.prompt}`
    : `Build this prototype: ${input.prompt}`;
  const directed = input.variantHint ? `${request}\n\nDesign direction for this variant: ${input.variantHint}` : request;

  const stream = client.messages.stream({
    model,
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    messages: [...history, { role: "user", content: directed }],
  });
  const message = await stream.finalMessage();
  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return {
    ...parseResponse(text),
    usage: { input: message.usage?.input_tokens ?? null, output: message.usage?.output_tokens ?? null },
  };
}
