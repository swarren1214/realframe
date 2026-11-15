import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { billableInput, fakeAiEnabled, systemBlocks } from "@/lib/ai";

// Planned builds. Before writing any code, a fast planner model breaks the request into a
// short, ordered list of steps. Each step is then built on top of the previous one, the way
// a coding agent works through a task list, so big requests don't get crammed into one pass.

export type PlanStep = {
  title: string;
  detail: string;
  status: "pending" | "done" | "failed";
  summary: string | null;
  /** "qa": the automated check-and-fix pass at the end of a build (see lib/qa). */
  kind?: "qa";
};

/** The last step of every planned build: check the result in a browser and fix what breaks. */
export function qaStep(): PlanStep {
  return {
    title: "Check and fix",
    detail: "Open the prototype in a browser, tap through every screen and fix what breaks.",
    status: "pending",
    summary: null,
    kind: "qa",
  };
}

export const MAX_STEPS = 6;

// Planner pricing (USD per million tokens). Defaults are Haiku-class rates.
const PLANNER_INPUT_USD_PER_MTOK = Number(
  process.env.REALFRAME_PLANNER_INPUT_USD_PER_MTOK || 1,
);
const PLANNER_OUTPUT_USD_PER_MTOK = Number(
  process.env.REALFRAME_PLANNER_OUTPUT_USD_PER_MTOK || 5,
);

const PLANNER_PROMPT = `You plan work for Realframe, which builds interactive, front-end-only HTML prototypes.
Another model will do the building, one step at a time. Each step receives the full document produced so far,
changes it, and must return a complete, working document. Your job is to split the user's request into those steps.

How to plan:
- Use as few steps as the request needs. A single, focused change (restyle something, fix a bug, add one element,
  tweak copy) is ONE step. Only split when the request genuinely has several substantial parts.
- At most ${MAX_STEPS} steps. Typical large builds need 3–5.
- For a new prototype, step 1 lays the foundation: overall layout and navigation, the visual style, the shared mock
  data, and the main screen. Later steps each add one coherent screen, flow or feature on top of it.
- Order steps so each builds on the last and the prototype works after every step. Put polish (empty states,
  responsive refinements, micro-interactions) last, and only if the request asks for it or it clearly matters.
- Every part of the request must land in some step. Don't add features the user didn't ask for.
- title: 3–8 words, imperative, shown to the user as a checklist item (e.g. "Build the dashboard shell").
- detail: 1–4 sentences telling the builder exactly what this step covers, including the specific screens,
  components, data and behaviours from the request that belong to it.

Submit the plan with the submit_plan tool.`;

const CHAT_PROMPT = `You are Realframe's assistant inside a prototype's chat. Realframe builds interactive, front-end-only
HTML prototypes. Each message the person sends either asks for a change to the prototype, or doesn't.

First decide which:
- They want the prototype built or changed (new screens, fixes, restyles, "make it…", "add…", "fix…", "yes, do that"
  after you offered a change): plan the build with submit_plan.
- Anything else (a question about the prototype or how something works, asking for ideas or feedback, discussing
  options, thanks, small talk): answer with reply. Don't build.
When it's unclear, prefer reply and ask a short question, unless they clearly asked for a change.

Replying:
- Be brief and concrete: a few sentences, or a short list when they asked for ideas or options. Plain text, no
  markdown headings.
- Answer from the current prototype's code when the question is about it. If you spot the cause of a problem,
  say what it is and offer to fix it ("Want me to fix that?"). Don't claim you changed anything: replies change nothing.
- Never paste code or full documents into a reply.

Planning (submit_plan):
- request: what to build, restated so it stands on its own without the chat (for example "Fix the Library tab so it
  shows the content list" when they said "yes, do that"). Keep their wording when it already stands on its own.
- steps: as below.

${PLANNER_PROMPT}`;

const REPLY_TOOL: Anthropic.Tool = {
  name: "reply",
  description:
    "Answer the person in the chat without changing the prototype. Use for questions, ideas, feedback and discussion.",
  input_schema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
};

const PLAN_TOOL: Anthropic.Tool = {
  name: "submit_plan",
  description: "Submit the ordered build steps.",
  input_schema: {
    type: "object",
    properties: {
      request: {
        type: "string",
        description:
          "What to build, restated so it stands on its own without the chat.",
      },
      steps: {
        type: "array",
        minItems: 1,
        maxItems: MAX_STEPS,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
          },
          required: ["title", "detail"],
        },
      },
    },
    required: ["steps"],
  },
};

/** The planner's steps, trimmed and checked. A one-step plan carries the request through. */
function cleanSteps(
  raw: { title?: unknown; detail?: unknown }[] | undefined,
  prompt: string,
  hasCurrent: boolean,
): PlanStep[] {
  const steps = (raw ?? [])
    .map((s) => ({
      title: String(s.title ?? "")
        .trim()
        .slice(0, 80),
      detail: String(s.detail ?? "")
        .trim()
        .slice(0, 1200),
    }))
    .filter((s) => s.title && s.detail)
    .slice(0, MAX_STEPS)
    .map((s) => ({ ...s, status: "pending" as const, summary: null }));
  if (steps.length === 0)
    return singleStep(
      prompt,
      hasCurrent ? "Apply the change" : "Build the prototype",
    );
  // A one-step plan should still carry the user's full wording to the builder.
  if (steps.length === 1) steps[0].detail = prompt;
  return steps;
}

/** A one-step plan that just carries the request through unchanged. */
function singleStep(prompt: string, title = "Apply the change"): PlanStep[] {
  return [{ title, detail: prompt, status: "pending", summary: null }];
}

/**
 * Short, single-line edits don't need a planner call: they're one step by definition, and
 * skipping it keeps small tweaks as fast as before.
 */
function obviouslySmall(prompt: string, hasCurrent: boolean) {
  return hasCurrent && prompt.length < 140 && !/\n/.test(prompt);
}

/** Keep the planner cheap: it needs the shape of the current prototype, not every line. */
function outline(html: string) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "<script>…</script>")
    .replace(/<style[\s\S]*?<\/style>/gi, "<style>…</style>")
    .replace(/\sdata-rf="[^"]*"/g, "")
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\s{2,}/g, " ");
  return stripped.length > 24_000
    ? `${stripped.slice(0, 24_000)}\n…(truncated)`
    : stripped;
}

export async function planBuild(input: {
  prompt: string;
  currentHtml: string | null;
  context?: string;
  /** A retry after a reply was cut off: split into more, smaller steps. */
  smaller?: boolean;
  /** A change aimed at elements someone pointed at: one focused step. */
  focused?: boolean;
}): Promise<{
  steps: PlanStep[];
  usage: { input: number; output: number; costMicros: number };
}> {
  const none = { input: 0, output: 0, costMicros: 0 };
  if (
    fakeAiEnabled() ||
    (input.focused && !input.smaller) ||
    (!input.smaller && obviouslySmall(input.prompt, Boolean(input.currentHtml)))
  )
    return { steps: singleStep(input.prompt), usage: none };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const client = new Anthropic({ apiKey });
  const model = process.env.REALFRAME_PLANNER_MODEL || "claude-haiku-5-5";

  const request = input.currentHtml
    ? `The prototype already exists. Its current structure (scripts and styles elided):\n<current_outline>\n${outline(input.currentHtml)}\n</current_outline>\n\nThe user's request:\n<request>\n${input.prompt}\n</request>`
    : `There is no prototype yet; this is a new build.\n\nThe user's request:\n<request>\n${input.prompt}\n</request>`;
  const retryNote = input.smaller
    ? "\n\nThe last attempt at this ran out of room before finishing. Split it into at least three smaller steps, each a self-contained piece (for example the layout and navigation first, then one screen or section per step)."
    : "";

  try {
    const message = await client.messages.create(
      {
        model,
        max_tokens: 2000,
        system: systemBlocks(PLANNER_PROMPT, input.context),
        tools: [PLAN_TOOL],
        tool_choice: { type: "tool", name: "submit_plan" },
        messages: [{ role: "user", content: request + retryNote }],
      },
      { signal: AbortSignal.timeout(40_000) },
    );
    const usage = {
      input: billableInput(message.usage),
      output: message.usage?.output_tokens ?? 0,
      costMicros: 0,
    };
    usage.costMicros = Math.round(
      usage.input * PLANNER_INPUT_USD_PER_MTOK +
        usage.output * PLANNER_OUTPUT_USD_PER_MTOK,
    );
    const call = message.content.find((b) => b.type === "tool_use");
    const raw = (call?.type === "tool_use" ? call.input : null) as {
      steps?: { title?: unknown; detail?: unknown }[];
    } | null;
    const steps = cleanSteps(raw?.steps, input.prompt, Boolean(input.currentHtml));
    return { steps, usage };
  } catch (err) {
    // Planning is an optimisation: if it fails, build the request in one pass as before.
    console.error("planBuild", err);
    return {
      steps: singleStep(
        input.prompt,
        input.currentHtml ? "Apply the change" : "Build the prototype",
      ),
      usage: none,
    };
  }
}

/** The instruction the builder gets for step `index` of a planned run. */
export function stepPrompt(prompt: string, all: PlanStep[], index: number) {
  // The check at the end isn't the builder's concern.
  const steps = all.filter((s) => s.kind !== "qa");
  if (steps.length === 1) return prompt;
  const list = steps
    .map((s, i) => {
      const mark = i < index ? "done" : i === index ? "NOW" : "later";
      return `${i + 1}. [${mark}] ${s.title}${i < index && s.summary ? ` — ${s.summary}` : ""}`;
    })
    .join("\n");
  const step = steps[index];
  return `The user asked for:
<request>
${prompt}
</request>

This is being built in ${steps.length} steps:
${list}

Do step ${index + 1} now: ${step.title}.
${step.detail}

Only do this step. ${index > 0 ? "Keep everything the earlier steps built working and intact. " : ""}Don't build later steps yet, though it's fine to leave sensible room for them (for example a nav item that later steps will fill in). The prototype must be complete and working at the end of this step.`;
}

/** The current document for the chat: whole when it fits, otherwise its outline. */
function chatDocument(html: string) {
  return html.length <= 90_000 ? html : outline(html);
}

export type ChatDecision =
  | {
      kind: "reply";
      text: string;
      usage: { input: number; output: number; costMicros: number };
    }
  | {
      kind: "build";
      /** The request to build, standing on its own without the chat. */
      request: string;
      steps: PlanStep[];
      usage: { input: number; output: number; costMicros: number };
    };

/**
 * A chat message: answer it, or plan a build for it. One fast model call decides and does
 * either. Replies change nothing and don't use a build. If the call fails, it's a build.
 */
export async function respondOrPlan(input: {
  prompt: string;
  currentHtml: string | null;
  history: { role: "user" | "assistant"; content: string }[];
  context?: string;
  smaller?: boolean;
  focused?: boolean;
}): Promise<ChatDecision> {
  const none = { input: 0, output: 0, costMicros: 0 };
  const build = async (request: string) => ({
    kind: "build" as const,
    request,
    ...(await planBuild({ ...input, prompt: request })),
  });
  // A retry of a build that was cut off is a build by definition.
  if (input.smaller) return build(input.prompt);
  if (fakeAiEnabled())
    return /\?\s*$/.test(input.prompt)
      ? { kind: "reply", text: "Fake AI: here's an answer.", usage: none }
      : build(input.prompt);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const client = new Anthropic({ apiKey });
  const model = process.env.REALFRAME_PLANNER_MODEL || "claude-haiku-5-5";

  const chat = input.history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Person" : "You"}: ${m.content.slice(0, 1500)}`)
    .join("\n\n");
  const request = [
    input.currentHtml
      ? `The current prototype:\n<current_document>\n${chatDocument(input.currentHtml)}\n</current_document>`
      : "There is no prototype yet.",
    chat ? `The chat so far, oldest first:\n<chat>\n${chat}\n</chat>` : "",
    `Their new message:\n<message>\n${input.prompt}\n</message>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const message = await client.messages.create(
      {
        model,
        max_tokens: 2500,
        system: systemBlocks(CHAT_PROMPT, input.context),
        tools: [REPLY_TOOL, PLAN_TOOL],
        tool_choice: { type: "any" },
        messages: [{ role: "user", content: request }],
      },
      { signal: AbortSignal.timeout(45_000) },
    );
    const usage = {
      input: billableInput(message.usage),
      output: message.usage?.output_tokens ?? 0,
      costMicros: 0,
    };
    usage.costMicros = Math.round(
      usage.input * PLANNER_INPUT_USD_PER_MTOK +
        usage.output * PLANNER_OUTPUT_USD_PER_MTOK,
    );
    const call = message.content.find((b) => b.type === "tool_use");
    if (call?.type !== "tool_use") return build(input.prompt);
    if (call.name === "reply") {
      const text = String((call.input as { text?: unknown }).text ?? "").trim();
      if (text) return { kind: "reply", text: text.slice(0, 4000), usage };
      return build(input.prompt);
    }
    const raw = call.input as {
      request?: unknown;
      steps?: { title?: unknown; detail?: unknown }[];
    };
    const restated = String(raw.request ?? "").trim().slice(0, 4000);
    const ask = restated || input.prompt;
    // Small and pointed edits stay one step, carrying the request through.
    if (
      input.focused ||
      obviouslySmall(input.prompt, Boolean(input.currentHtml))
    )
      return { kind: "build", request: ask, steps: singleStep(ask), usage };
    const steps = cleanSteps(raw.steps, ask, Boolean(input.currentHtml));
    return { kind: "build", request: ask, steps, usage };
  } catch (err) {
    // Deciding is an optimisation: if it fails, treat the message as a build request.
    console.error("respondOrPlan", err);
    return build(input.prompt);
  }
}
