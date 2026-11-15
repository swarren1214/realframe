import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fakeAiEnabled } from "@/lib/ai";

// Planned builds. Before writing any code, a fast planner model breaks the request into a
// short, ordered list of steps. Each step is then built on top of the previous one, the way
// a coding agent works through a task list, so big requests don't get crammed into one pass.

export type PlanStep = {
  title: string;
  detail: string;
  status: "pending" | "done" | "failed";
  summary: string | null;
};

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

const PLAN_TOOL: Anthropic.Tool = {
  name: "submit_plan",
  description: "Submit the ordered build steps.",
  input_schema: {
    type: "object",
    properties: {
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
        system: input.context
          ? `${PLANNER_PROMPT}\n\nAbout this project:\n${input.context}`
          : PLANNER_PROMPT,
        tools: [PLAN_TOOL],
        tool_choice: { type: "tool", name: "submit_plan" },
        messages: [{ role: "user", content: request + retryNote }],
      },
      { signal: AbortSignal.timeout(40_000) },
    );
    const usage = {
      input: message.usage?.input_tokens ?? 0,
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
    const steps = (raw?.steps ?? [])
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
      return {
        steps: singleStep(
          input.prompt,
          input.currentHtml ? "Apply the change" : "Build the prototype",
        ),
        usage,
      };
    // A one-step plan should still carry the user's full wording to the builder.
    if (steps.length === 1) steps[0].detail = input.prompt;
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
export function stepPrompt(prompt: string, steps: PlanStep[], index: number) {
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
