// A planned build's step: progress lines while it builds, and Stop mid-step.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state: {
  server: ReturnType<typeof fakeSupabase>;
  admin: ReturnType<typeof fakeSupabase>;
  run: Record<string, unknown>;
  cancel: string | null;
  finalized: unknown[];
  failed: unknown[];
} = {} as never;

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
  updateRun: async () => {},
  finalizeRun: async (_s: unknown, _r: unknown, opts: unknown) => {
    state.finalized.push(opts);
    return { id: "v9", number: 9 };
  },
  failRun: async (_s: unknown, _r: unknown, opts: unknown) => {
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
      if (state.cancel === "never") {
        input.onProgress?.(2048);
        await new Promise((r) => setTimeout(r, 800));
        input.onProgress?.(9000);
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

beforeEach(() => {
  state.cancel = "never";
  state.finalized = [];
  state.failed = [];
  state.run = {
    id: "r1",
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
    updated_at: new Date().toISOString(),
  };
  state.server = fakeSupabase(
    (c) => (c.rpc === "project_role" ? { data: "editor" } : undefined),
    { id: "u1", email: "a@b.co" },
  );
  state.admin = fakeSupabase((c) => {
    if (c.table === "build_runs" && c.op === "update")
      return { data: [{ id: "r1" }] };
    if (c.table === "build_runs" && c.op === "select")
      return {
        data: {
          cancel_requested_at: state.cancel === "now" ? "2026-01-01" : null,
        },
      };
  });
});

const ctx = { params: Promise.resolve({ id: "p1", runId: "r1" }) };
const post = (stream = true) =>
  new NextRequest("https://www.realframe.app/api/projects/p1/plan/r1", {
    method: "POST",
    body: JSON.stringify({ index: 1 }),
    headers: stream ? { accept: "application/x-ndjson" } : {},
  });
const lines = async (res: Response) =>
  (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

describe("planned build step", () => {
  it("streams progress, then the result", async () => {
    const { POST } = await import("@/app/api/projects/[id]/plan/[runId]/route");
    const res = await POST(post(), ctx);
    expect(res.headers.get("content-type")).toContain("ndjson");
    const out = await lines(res);
    expect(
      out.filter((l) => l.type === "progress").map((l) => l.chars),
    ).toEqual([2048, 9000]);
    expect(out.at(-1)).toMatchObject({
      type: "result",
      status: 200,
      body: { index: 1, done: false, nextStep: 2 },
    });
  });

  it("still answers plain JSON when progress isn't asked for", async () => {
    const { POST } = await import("@/app/api/projects/[id]/plan/[runId]/route");
    const res = await POST(post(false), ctx);
    expect(await res.json()).toMatchObject({ index: 1, done: false });
  });

  it("stops mid-step when Stop is pressed, keeps finished steps and charges nothing for this one", async () => {
    state.cancel = "now";
    const { POST } = await import("@/app/api/projects/[id]/plan/[runId]/route");
    const out = await lines(await POST(post(), ctx));
    expect(out.at(-1)).toMatchObject({
      type: "result",
      status: 200,
      body: { stopped: true, versionId: "v9", number: 9 },
    });
    expect(state.finalized[0]).toMatchObject({ status: "cancelled" });
    expect(state.failed).toHaveLength(0);
  }, 10_000);

  it("asks a building step to stop when Stop is pressed", async () => {
    state.run = { ...state.run, running_step: 1 };
    const { DELETE } =
      await import("@/app/api/projects/[id]/plan/[runId]/route");
    const res = await DELETE(
      new NextRequest("https://www.realframe.app/api/projects/p1/plan/r1", {
        method: "DELETE",
      }),
      ctx,
    );
    expect(res!.status).toBe(202);
    const flag = state.admin.calls.find(
      (c) => c.table === "build_runs" && c.op === "update",
    );
    expect(flag?.values).toMatchObject({
      cancel_requested_at: expect.any(String),
    });
  });
});
