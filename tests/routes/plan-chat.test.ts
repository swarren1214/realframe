// The chat route: answers don't use a build; builds end with the check step.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state: {
  server: ReturnType<typeof fakeSupabase>;
  admin: ReturnType<typeof fakeSupabase>;
  decision: unknown;
  started: string[];
} = {} as never;

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.server.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => state.admin.client }));
vi.mock("@/lib/builds", async (orig) => ({
  ...(await orig<typeof import("@/lib/builds")>()),
  loadBuildContext: async () => ({
    current: { id: "v1", html: "<html></html>", kind: "html" },
    history: [],
    context: "",
    designSystemId: null,
  }),
}));
vi.mock("@/lib/plan", async (orig) => ({
  ...(await orig<typeof import("@/lib/plan")>()),
  respondOrPlan: async () => state.decision,
}));
vi.mock("@/lib/plan-runner", () => ({
  startRunStep: async (id: string) => {
    state.started.push(id);
  },
}));

const call = (prompt: string) =>
  new NextRequest("https://www.realframe.app/api/projects/p1/plan", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
const ctx = { params: Promise.resolve({ id: "p1" }) };

beforeEach(() => {
  state.started = [];
  state.server = fakeSupabase(
    (c) => {
      if (c.rpc === "project_role") return { data: "editor" };
      if (c.rpc === "claim_generation") return { data: "g1" };
    },
    { id: "u1", email: "a@b.co" },
  );
  state.admin = fakeSupabase((c) =>
    c.table === "build_runs" && c.op === "insert" ? { data: { id: "run1" } } : undefined,
  );
});

describe("chat", () => {
  it("answers a question without claiming a build", async () => {
    state.decision = { kind: "reply", text: "It routes with #/library.", usage: {} };
    const { POST } = await import("@/app/api/projects/[id]/plan/route");
    const out = await (await POST(call("How does the library tab work?"), ctx)).json();
    expect(out).toEqual({ reply: "It routes with #/library." });
    expect(state.server.calls.some((c) => c.rpc === "claim_generation")).toBe(false);
    const answer = state.admin.calls.find((c) => c.table === "messages" && c.op === "insert");
    expect(answer?.values).toMatchObject({ role: "assistant", content: "It routes with #/library." });
    expect(state.started).toEqual([]);
  });

  it("builds a change, ending with the check step, with the restated request", async () => {
    state.decision = {
      kind: "build",
      request: "Fix the Library tab",
      steps: [{ title: "Fix the Library tab", detail: "x", status: "pending", summary: null }],
      usage: { input: 1, output: 1, costMicros: 1 },
    };
    const { POST } = await import("@/app/api/projects/[id]/plan/route");
    const out = await (await POST(call("yes do that"), ctx)).json();
    expect(out.steps.map((s: { title: string }) => s.title)).toEqual([
      "Fix the Library tab",
      "Check and fix",
    ]);
    expect(state.server.calls.some((c) => c.rpc === "claim_generation")).toBe(true);
    const run = state.admin.calls.find((c) => c.table === "build_runs" && c.op === "insert");
    expect(run?.values).toMatchObject({ prompt: "Fix the Library tab" });
    expect(state.started).toEqual(["run1"]);
  });
});
