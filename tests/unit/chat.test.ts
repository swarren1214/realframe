// Chat: one fast call decides whether a message gets an answer or a build.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { qaStep, stepPrompt, type PlanStep } from "@/lib/plan";

const state: { reply: { name: string; input: unknown } | null; fail?: boolean; sent?: unknown } = {
  reply: null,
};
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (body: unknown) => {
        state.sent = body;
        if (state.fail) throw new Error("down");
        return {
          usage: { input_tokens: 1000, output_tokens: 100 },
          content: state.reply ? [{ type: "tool_use", ...state.reply }] : [],
        };
      },
    };
  },
}));

const html = "<!doctype html><html><body><a href='#/library'>Library</a></body></html>";
const base = { currentHtml: html, history: [] };

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  state.reply = null;
  state.fail = false;
});
afterEach(() => vi.unstubAllEnvs());

describe("respondOrPlan", () => {
  it("answers a question without planning a build", async () => {
    state.reply = { name: "reply", input: { text: "The Library tab routes to #/library." } };
    const { respondOrPlan } = await import("@/lib/plan");
    const d = await respondOrPlan({ ...base, prompt: "How does the library tab work?" });
    expect(d).toMatchObject({ kind: "reply", text: "The Library tab routes to #/library." });
    // The model sees the current document to answer from it.
    expect(JSON.stringify(state.sent)).toContain("#/library");
  });

  it("plans a build, restating a request that leans on the chat", async () => {
    state.reply = {
      name: "submit_plan",
      input: {
        request: "Fix the Library tab so it shows the content list",
        steps: [{ title: "Fix the Library tab", detail: "x" }],
      },
    };
    const { respondOrPlan } = await import("@/lib/plan");
    const d = await respondOrPlan({
      ...base,
      prompt: "yes please do that",
      history: [
        { role: "user", content: "why is library blank?" },
        { role: "assistant", content: "Its view throws. Want me to fix that?" },
      ],
    });
    expect(d.kind).toBe("build");
    if (d.kind !== "build") return;
    expect(d.request).toBe("Fix the Library tab so it shows the content list");
    expect(d.steps).toHaveLength(1);
    expect(d.steps[0].detail).toBe("Fix the Library tab so it shows the content list");
  });

  it("keeps multi-step plans for bigger requests", async () => {
    state.reply = {
      name: "submit_plan",
      input: {
        request: "Build a CRM",
        steps: [
          { title: "Lay out the shell", detail: "a" },
          { title: "Add the pipeline", detail: "b" },
        ],
      },
    };
    const { respondOrPlan } = await import("@/lib/plan");
    const d = await respondOrPlan({
      ...base,
      currentHtml: null,
      prompt: "Build a CRM with contacts, a deals pipeline and reports.\nMobile first.",
    });
    expect(d.kind === "build" && d.steps.map((s) => s.title)).toEqual([
      "Lay out the shell",
      "Add the pipeline",
    ]);
  });

  it("treats a failed call as a build, so nothing gets lost", async () => {
    state.fail = true;
    const { respondOrPlan } = await import("@/lib/plan");
    const d = await respondOrPlan({ ...base, prompt: "Make the header green" });
    expect(d).toMatchObject({ kind: "build", request: "Make the header green" });
  });
});

describe("the check step", () => {
  const step = (title: string): PlanStep => ({ title, detail: title, status: "pending", summary: null });
  it("isn't shown to the builder", () => {
    expect(stepPrompt("Add a footer", [step("Apply the change"), qaStep()], 0)).toBe("Add a footer");
    const p = stepPrompt("Shop", [step("Shell"), step("Cart"), qaStep()], 1);
    expect(p).not.toContain("Check and fix");
    expect(p).toContain("2. [NOW] Cart");
  });
});
