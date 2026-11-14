import { afterEach, describe, expect, it, vi } from "vitest";
import { planBuild, stepPrompt, type PlanStep } from "@/lib/plan";

const step = (title: string, extra: Partial<PlanStep> = {}): PlanStep => ({
  title,
  detail: `Details for ${title}.`,
  status: "pending",
  summary: null,
  ...extra,
});

describe("planBuild", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps a short single-line edit as one step without calling the planner", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { steps, usage } = await planBuild({
      prompt: "Make the primary button green",
      currentHtml: "<!doctype html><html><body></body></html>",
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].detail).toBe("Make the primary button green");
    expect(usage.costMicros).toBe(0);
  });

  it("uses one step in fake-AI test mode", async () => {
    vi.stubEnv("REALFRAME_FAKE_AI", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    const { steps } = await planBuild({
      prompt: "A CRM with contacts, deals pipeline, reports and settings",
      currentHtml: null,
    });
    expect(steps).toHaveLength(1);
  });
});

describe("stepPrompt", () => {
  it("passes a one-step plan through unchanged", () => {
    expect(stepPrompt("Add a footer", [step("Apply the change")], 0)).toBe(
      "Add a footer",
    );
  });

  it("shows progress and scopes the builder to the current step", () => {
    const steps = [
      step("Build the shell", { status: "done", summary: "Built the nav." }),
      step("Add the deals board"),
      step("Add reports"),
    ];
    const text = stepPrompt("A CRM", steps, 1);
    expect(text).toContain("1. [done] Build the shell — Built the nav.");
    expect(text).toContain("2. [NOW] Add the deals board");
    expect(text).toContain("3. [later] Add reports");
    expect(text).toContain("Do step 2 now: Add the deals board.");
    expect(text).toContain("Keep everything the earlier steps built");
  });

  it("doesn't mention earlier steps on the first step", () => {
    const text = stepPrompt("A CRM", [step("A"), step("B")], 0);
    expect(text).not.toContain("Keep everything the earlier steps built");
  });
});
