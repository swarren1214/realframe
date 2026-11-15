import type { ReferenceBlock } from "@/lib/references";
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
- Keep the document compact so it always finishes: define mock data once in small JS arrays and render lists, cards,
  rows and repeated screens from it with functions, rather than writing out every item by hand. Prefer a handful of
  rich, working screens over many shallow ones, and keep comments to a minimum.

When you are given an existing document, apply the requested change and return the FULL updated document,
keeping everything that was not asked to change. Elements may carry data-rf="…" attributes and the head may contain a
<style data-rf-edits> block: these come from the visual editor, so keep them exactly as they are (give new elements no data-rf).

Respond in exactly this format and nothing else:
<summary>One or two plain sentences describing what you built or changed.</summary>
<document>
...the complete HTML document...
</document>`;

export type GenerateInput = {
  prompt: string;
  /** Extra direction used to push variants apart. */
  variantHint?: string;
  /** Project-level direction appended to the system prompt: target devices, design system. */
  context?: string;
  currentHtml: string | null;
  /** Seconds the caller can wait; continuations stop well inside it. */
  timeBudgetSeconds?: number;
  /**
   * When the work must be done by (epoch ms), usually the route's own time limit less a margin
   * for saving. Each AI call is aborted at this point, so the route can fail cleanly instead of
   * being killed mid-build. Defaults to now + timeBudgetSeconds (or 280 s), less 20 s.
   */
  deadline?: number;
  history: { role: "user" | "assistant"; content: string }[];
  /** Reference images and PDFs the person attached, shown to the model first. */
  references?: ReferenceBlock[];
};

export type GenerateResult = { html: string; summary: string };

/** A failed build, with the tokens it used so the cause can be traced. */
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly usage: { input: number; output: number },
  ) {
    super(message);
  }
}

/** A route's deadline: its time limit from when the request arrived, less a margin to save. */
export function routeDeadline(maxDurationSeconds: number, marginSeconds = 25) {
  return Date.now() + (maxDurationSeconds - marginSeconds) * 1000;
}

/** A continuation round needs at least this long to be worth starting. */
export const MIN_ROUND_MS = 90_000;

export const TOO_SLOW_MESSAGE =
  "The build took too long and was stopped before it finished, so it wasn't charged. Try a smaller change, or split it into steps.";

/** Whether an error is the AI call being aborted (by the deadline or the caller). */
export function isAbort(e: unknown) {
  const name = (e as { name?: string } | null)?.name ?? "";
  return (
    name === "AbortError" ||
    name === "TimeoutError" ||
    name === "APIUserAbortError" ||
    /aborted/i.test((e as Error | null)?.message ?? "")
  );
}

export function parseResponse(text: string): GenerateResult {
  const summary =
    text.match(/<summary>([\s\S]*?)<\/summary>/i)?.[1]?.trim() ??
    "Updated the prototype.";
  let html = text.match(/<document>([\s\S]*?)<\/document>/i)?.[1]?.trim() ?? "";
  if (!html) {
    const start = text.search(/<!doctype html|<html/i);
    const end = text.toLowerCase().lastIndexOf("</html>");
    if (start >= 0 && end > start) html = text.slice(start, end + 7);
  }
  html = html
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) {
    throw new Error(
      "The model did not return a complete HTML document. Try again.",
    );
  }
  return { html, summary };
}

export async function generatePrototype(
  input: GenerateInput,
): Promise<
  GenerateResult & { usage: { input: number | null; output: number | null } }
> {
  if (fakeAiEnabled()) return fakePrototype(input);
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
  if (history.length && history[history.length - 1].role === "user")
    history.pop();
  const request = input.currentHtml
    ? `Here is the current prototype:\n<current_document>\n${input.currentHtml}\n</current_document>\n\nRequested change: ${input.prompt}`
    : `Build this prototype: ${input.prompt}`;
  const directed = input.variantHint
    ? `${request}\n\nDesign direction for this variant: ${input.variantHint}`
    : request;

  const system = input.context
    ? `${SYSTEM_PROMPT}\n\nAbout this project:\n${input.context}`
    : SYSTEM_PROMPT;
  const refs = input.references ?? [];
  const first = {
    role: "user" as const,
    content: refs.length
      ? [
          ...refs,
          {
            type: "text" as const,
            text: `${refs.length === 1 ? "The attachment above is a reference" : `The ${refs.length} attachments above are references`} the person provided. Use ${refs.length === 1 ? "it" : "them"} for layout, content and visual style as the request describes.\n\n${directed}`,
          },
        ]
      : directed,
  };
  const started = Date.now();
  const deadline =
    input.deadline ?? started + ((input.timeBudgetSeconds ?? 280) - 20) * 1000;
  let text = "";
  let inTokens = 0;
  let outTokens = 0;
  // A long prototype can run past the output limit. When it does, ask the
  // model to carry on from where it stopped, while there's time left.
  for (let round = 0; round < 3; round++) {
    const messages =
      round === 0
        ? [...history, first]
        : [
            ...history,
            first,
            { role: "assistant" as const, content: text },
            {
              role: "user" as const,
              content:
                "Your reply was cut off by the length limit. Continue exactly where it stopped, starting with the very next character. Don't repeat anything or add commentary, and finish with </document>.",
            },
          ];
    const left = deadline - Date.now();
    if (left < (round === 0 ? 15_000 : MIN_ROUND_MS))
      throw new GenerationError(
        round === 0
          ? TOO_SLOW_MESSAGE
          : "The prototype was too big to finish in one build. Try asking for fewer screens first, then add more in follow-up prompts.",
        { input: inTokens, output: outTokens },
      );
    let message;
    try {
      message = await client.messages
        .stream(
          { model, max_tokens: 32000, system, messages },
          { signal: AbortSignal.timeout(left) },
        )
        .finalMessage();
    } catch (e) {
      if (isAbort(e))
        throw new GenerationError(TOO_SLOW_MESSAGE, {
          input: inTokens,
          output: outTokens,
        });
      throw e;
    }
    inTokens += message.usage?.input_tokens ?? 0;
    outTokens += message.usage?.output_tokens ?? 0;
    text += message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    if (message.stop_reason !== "max_tokens") break;
    if (round === 2) {
      throw new GenerationError(
        "The prototype was too big to finish in one build. Try asking for fewer screens first, then add more in follow-up prompts.",
        { input: inTokens, output: outTokens },
      );
    }
  }
  try {
    return {
      ...parseResponse(text),
      usage: { input: inTokens, output: outTokens },
    };
  } catch (e) {
    throw new GenerationError((e as Error).message, {
      input: inTokens,
      output: outTokens,
    });
  }
}

/**
 * End-to-end tests set REALFRAME_FAKE_AI=1 so builds are instant, free and deterministic.
 * Never honoured on a production deployment.
 */
export function fakeAiEnabled() {
  return (
    process.env.REALFRAME_FAKE_AI === "1" &&
    process.env.VERCEL_ENV !== "production"
  );
}

export function fakePrototype(
  input: Pick<GenerateInput, "prompt" | "currentHtml">,
) {
  const n = input.currentHtml?.match(/data-build="(\d+)"/)?.[1] ?? "0";
  const next = Number(n) + 1;
  const safe = input.prompt
    .slice(0, 200)
    .replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test prototype</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:48px;background:#f8fafc}button{padding:12px 20px;border-radius:12px;border:0;background:#1e3a8a;color:#fff}</style></head>
<body data-build="${next}">
<h1>Test prototype · build ${next}</h1>
<p id="prompt">${safe}</p>
<button type="button">Continue</button>
</body>
</html>`;
  return {
    html,
    summary: `Built test prototype ${next}.`,
    usage: { input: 0, output: 0 },
  };
}
