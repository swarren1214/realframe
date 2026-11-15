// Planned builds run on the server: each step builds in a background call and hands off to
// the next, so the page can close mid-build. Also: Stop, and restarting a lost hand-off.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state: {
  server: ReturnType<typeof fakeSupabase>;
  admin: ReturnType<typeof fakeSupabase>;
  run: Record<string, unknown>;
  cancel: "never" | "now" | "flagged";
  taken: boolean;
  finalized: Record<string, unknown>[];
  failed: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  generated: number;
  handoffs: string[];
  after: (() => unknown)[];
} = {} as never;

vi.mock("next/server", async (orig) => {
  const real = await orig<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => state.after.push(fn) };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.server.client,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("@/lib/references", () => ({
  readReferences: () => [],
  referenceBlocks: async () => [],
}));
vi.mock("@/lib/builds", () => ({
  loadBuildContext: async () => ({
    current: { html: "<html></html>" },
    history: [],
    context: "",
    designSystemId: null,
  }),
}));
vi.mock("@/lib/plan-runs", () => ({
  loadRun: async () => state.run,
  updateRun: async (_id: string, patch: Record<string, unknown>) => {
    state.updates.push(patch);
  },
  finalizeRun: async (_r: unknown, opts: Record<string, unknown>) => {
    state.finalized.push(opts);
    return { id: "v9", number: 9 };
  },
  failRun: async (_r: unknown, opts: Record<string, unknown>) => {
    state.failed.push(opts);
  },
}));
vi.mock("@/lib/ai", async (orig) => {
  const real = await orig<typeof import("@/lib/ai")>();
  return {
    ...real,
    generatePrototype: async (input: {
      signal: AbortSignal;
      onProgress?: (n: number) => void;
    }) => {
      state.generated++;
      if (state.cancel === "never") {
        input.onProgress?.(2048);
        return {
          html: "<html>done</html>",
          summary: "Built it",
          usage: { input: 1, output: 1 },
        };
      }
      await new Promise<void>((resolve) =>
        input.signal.addEventListener("abort", () => resolve()),
      );
      throw new real.StoppedError(real.STOPPED_MESSAGE, {
        input: 5,
        output: 7,
      });
    },
  };
});

const steps = [
  { title: "Layout", status: "done" },
  { title: "Checkout", status: "pending" },
  { title: "Polish", status: "pending" },
];
const RUN_ID = "01b781df-78ea-4a44-87e8-58a1ceaf0253";

beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "secret");
  state.cancel = "never";
  state.taken = true;
  state.finalized = [];
  state.failed = [];
  state.updates = [];
  state.generated = 0;
  state.handoffs = [];
  state.after = [];
  state.run = {
    id: RUN_ID,
    project_id: "p1",
    user_id: "u1",
    generation_id: "g1",
    base_version_id: null,
    prompt: "Shop",
    steps,
    references: [],
    next_step: 1,
    running_step: null,
    working_html: "<html>step1</html>",
    input_tokens: 0,
    output_tokens: 0,
    cost_micros: 0,
    status: "running",
    cancel_requested_at: null,
    updated_at: new Date().toISOString(),
  };
  state.server = fakeSupabase(
    (c) => (c.rpc === "project_role" ? { data: "editor" } : undefined),
    { id: "u1", email: "a@b.co" },
  );
  state.admin = fakeSupabase((c) => {
    if (c.table !== "build_runs") return;
    const values = (c.values ?? {}) as Record<string, unknown>;
    if (c.op === "update" && "running_step" in values)
      return { data: state.taken ? [{ id: RUN_ID }] : [] };
    if (c.op === "select" && c.values === "*")
      return {
        data: {
          ...state.run,
          cancel_requested_at:
            state.cancel === "flagged" ? "2026-01-01" : null,
        },
      };
    if (c.op === "select")
      return {
        data: {
          cancel_requested_at: state.cancel === "now" ? "2026-01-01" : null,
        },
      };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      state.handoffs.push(`${url} ${init.body}`);
      return new Response(null, { status: 202 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const origin = "https://www.realframe.app";
const later = () => Date.now() + 200_000;

describe("background step", () => {
  it("builds the next step, records progress, then hands off to the step after it", async () => {
    const { runStep } = await import("@/lib/plan-runner");
    await runStep(RUN_ID, origin, later());
    expect(state.generated).toBe(1);
    expect(state.updates[0]).toMatchObject({
      next_step: 2,
      running_step: null,
      working_html: "<html>done</html>",
    });
    const progress = state.admin.calls.find(
      (c) =>
        c.op === "update" &&
        (c.values as Record<string, unknown>).progress_chars === 2048,
    );
    expect(progress).toBeTruthy();
    expect(state.handoffs).toEqual([
      `${origin}/api/plan-runs/step ${JSON.stringify({ runId: RUN_ID })}`,
    ]);
    expect(state.finalized).toHaveLength(0);
  });

  it("saves the version when the last step lands, with no further hand-off", async () => {
    state.run = { ...state.run, next_step: 2 };
    const { runStep } = await import("@/lib/plan-runner");
    await runStep(RUN_ID, origin, later());
    expect(state.finalized[0]).toMatchObject({
      status: "succeeded",
      html: "<html>done</html>",
      userId: "u1",
    });
    expect(state.handoffs).toHaveLength(0);
  });

  it("does nothing when the step is already taken (a double start)", async () => {
    state.taken = false;
    const { runStep } = await import("@/lib/plan-runner");
    await runStep(RUN_ID, origin, later());
    expect(state.generated).toBe(0);
    expect(state.handoffs).toHaveLength(0);
  });

  it("stops mid-step when Stop is pressed, keeps finished steps and charges nothing for this one", async () => {
    state.cancel = "now";
    const { runStep } = await import("@/lib/plan-runner");
    await runStep(RUN_ID, origin, later());
    expect(state.finalized[0]).toMatchObject({ status: "cancelled" });
    expect(state.failed).toHaveLength(0);
    expect(state.handoffs).toHaveLength(0);
  }, 10_000);

  it("settles without building when Stop landed between steps", async () => {
    state.cancel = "flagged";
    const { runStep } = await import("@/lib/plan-runner");
    await runStep(RUN_ID, origin, later());
    expect(state.generated).toBe(0);
    expect(state.finalized[0]).toMatchObject({ status: "cancelled" });
  });
});

describe("step route", () => {
  const call = (key: string) =>
    new NextRequest(`${origin}/api/plan-runs/step`, {
      method: "POST",
      body: JSON.stringify({ runId: RUN_ID }),
      headers: { "x-realframe-key": key },
    });

  it("refuses calls without the run's key", async () => {
    const { POST } = await import("@/app/api/plan-runs/step/route");
    const res = await POST(call("nope"));
    expect(res.status).toBe(403);
    expect(state.after).toHaveLength(0);
  });

  it("answers at once and builds after the answer", async () => {
    const { runStepKey } = await import("@/lib/plan-runner");
    const { POST } = await import("@/app/api/plan-runs/step/route");
    const res = await POST(call(runStepKey(RUN_ID)));
    expect(res.status).toBe(202);
    expect(state.generated).toBe(0);
    await state.after[0]();
    expect(state.generated).toBe(1);
  });
});

describe("watching page", () => {
  const ctx = { params: Promise.resolve({ id: "p1", runId: RUN_ID }) };
  const req = (method: string) =>
    new NextRequest(`${origin}/api/projects/p1/plan/${RUN_ID}`, { method });

  it("restarts a run whose hand-off was lost", async () => {
    state.run = {
      ...state.run,
      updated_at: new Date(Date.now() - 60_000).toISOString(),
    };
    const { POST } = await import("@/app/api/projects/[id]/plan/[runId]/route");
    const out = await (await POST(req("POST"), ctx)).json();
    expect(out).toMatchObject({ restarted: true });
    expect(state.handoffs).toHaveLength(1);
  });

  it("leaves a healthy run alone", async () => {
    state.run = { ...state.run, running_step: 1 };
    const { POST } = await import("@/app/api/projects/[id]/plan/[runId]/route");
    const out = await (await POST(req("POST"), ctx)).json();
    expect(out).toMatchObject({ restarted: false });
    expect(state.handoffs).toHaveLength(0);
  });

  it("asks a building step to stop", async () => {
    state.run = { ...state.run, running_step: 1 };
    state.taken = false;
    const { DELETE } =
      await import("@/app/api/projects/[id]/plan/[runId]/route");
    const res = await DELETE(req("DELETE"), ctx);
    expect(res!.status).toBe(202);
    const flag = state.admin.calls.find(
      (c) =>
        c.table === "build_runs" &&
        c.op === "update" &&
        "cancel_requested_at" in (c.values as object),
    );
    expect(flag).toBeTruthy();
    expect(state.finalized).toHaveLength(0);
  });

  it("settles a run stopped between steps, keeping the finished ones", async () => {
    const { DELETE } =
      await import("@/app/api/projects/[id]/plan/[runId]/route");
    const out = await (await DELETE(req("DELETE"), ctx))!.json();
    expect(out).toMatchObject({ stopped: true, versionId: "v9" });
    expect(state.finalized[0]).toMatchObject({ status: "cancelled" });
  });
});
