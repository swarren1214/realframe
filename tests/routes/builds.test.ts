// The build routes: who can build, limits, and what a failed build costs.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type Call, type Handler } from "./fake-supabase";

const state: {
  server: ReturnType<typeof fakeSupabase>;
  admin: ReturnType<typeof fakeSupabase>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generate: Mock<(...a: any[]) => Promise<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marked: Mock<(...a: any[]) => Promise<any>>;
} = {} as never;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.server.client,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("@/lib/ai", async (orig) => {
  const real = await orig<typeof import("@/lib/ai")>();
  return {
    ...real,
    generatePrototype: (...a: unknown[]) => state.generate(...a),
  };
});
vi.mock("@/lib/services/reviews", () => ({
  markAddressed: (...a: unknown[]) => state.marked(...a),
}));

const HTML = "<!doctype html><html><body>v2</body></html>";
const THREADS = [
  {
    id: "t1",
    x: 0.2,
    y: 0.3,
    status: "open",
    guest_name: null,
    comments: [
      {
        author_email: "maya@acme.co",
        author_name: "Maya",
        body: "Bigger",
        created_at: "2026-11-10T00:00:00Z",
      },
    ],
  },
  {
    id: "t2",
    x: 0.7,
    y: 0.6,
    status: "open",
    guest_name: "Client",
    comments: [
      {
        author_email: "guest",
        author_name: null,
        body: "Blue?",
        created_at: "2026-11-10T00:00:00Z",
      },
    ],
  },
];

function server(
  over: Partial<Record<string, (c: Call) => unknown>> = {},
): Handler {
  return (c) => {
    if (c.rpc && over[c.rpc]) return over[c.rpc]!(c) as never;
    if (c.rpc === "project_role") return { data: "owner" };
    if (c.rpc === "claim_generation") return { data: "claim-1" };
    if (c.rpc === "create_version") return { data: { id: "v2", number: 2 } };
    if (c.table === "comment_threads") {
      const ids = c.filters.find((f) => f[0] === "in")?.[2] as
        string[] | undefined;
      return {
        data: ids ? THREADS.filter((t) => ids.includes(t.id)) : THREADS,
      };
    }
    if (c.table === "versions")
      return {
        data: [
          { id: "v1", html: "<html><body>v1</body></html>", kind: "html" },
        ],
      };
    if (c.table === "projects")
      return {
        data: { slug: "checkout-ab12", devices: null, design_system_id: null },
      };
    if (c.table === "messages") return { data: [] };
  };
}

function setup(handler: Handler = server(), signedIn = true) {
  state.server = fakeSupabase(
    handler,
    signedIn ? { id: "u1", email: "steve@acme.co" } : null,
  );
  state.admin = fakeSupabase();
  state.generate = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({
    html: HTML,
    summary: "Fixed both.",
    usage: { input: 1000, output: 2000 },
  }));
  state.marked = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => 1);
}

const post = (body: unknown, path = "fix") =>
  new NextRequest(`https://www.realframe.app/api/projects/p1/${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", host: "www.realframe.app" },
  });
const ctx = { params: Promise.resolve({ id: "p1" }) };

const finish = () =>
  state.admin.calls.find((c) => c.rpc === "finish_generation");

beforeEach(() => setup());
afterEach(() => vi.clearAllMocks());

describe("fix from feedback", () => {
  it("requires sign-in and a builder role", async () => {
    const { POST } = await import("@/app/api/projects/[id]/fix/route");
    setup(server(), false);
    expect((await POST(post({ threadIds: ["t1"] }), ctx)).status).toBe(401);
    setup(server({ project_role: () => ({ data: "commenter" }) }));
    expect((await POST(post({ threadIds: ["t1"] }), ctx)).status).toBe(403);
    expect(state.generate).not.toHaveBeenCalled();
  });

  it("rejects an empty selection and threads from elsewhere", async () => {
    const { POST } = await import("@/app/api/projects/[id]/fix/route");
    expect((await POST(post({ threadIds: [] }), ctx)).status).toBe(400);
    const res = await POST(post({ threadIds: ["t1", "t2", "t-other"] }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/aren't on this prototype/);
  });

  it("builds once from the threads, marks them addressed and bills the build", async () => {
    const { POST } = await import("@/app/api/projects/[id]/fix/route");
    const res = await POST(
      post({ threadIds: ["t1", "t2"], note: "keep colors" }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      versionId: "v2",
      number: 2,
      addressed: 2,
      notified: 1,
    });
    const prompt = (state.generate.mock.calls[0][0] as { prompt: string })
      .prompt;
    expect(prompt).toContain("Maya: Bigger");
    expect(prompt).toContain("Client: Blue?");
    expect(prompt).toContain("The builder adds: keep colors");
    expect(finish()?.args).toMatchObject({
      p_status: "succeeded",
      p_cost_micros: 3000 + 30000,
    });
    expect(state.marked).toHaveBeenCalledWith(
      state.server.client,
      expect.objectContaining({
        threadIds: ["t1", "t2"],
        version: { id: "v2", number: 2 },
        reviewUrl: "https://checkout-ab12.realframe.app",
      }),
    );
  });

  it("bills nothing and marks nothing when the build fails", async () => {
    const { POST } = await import("@/app/api/projects/[id]/fix/route");
    const { GenerationError } = await import("@/lib/ai");
    state.generate.mockRejectedValue(
      new GenerationError("Model gave up", { input: 50_000, output: 8_000 }),
    );
    const res = await POST(post({ threadIds: ["t1"] }), ctx);
    expect(res.status).toBe(500);
    expect(finish()?.args).toMatchObject({
      p_status: "failed",
      p_cost_micros: 0,
    });
    expect(state.marked).not.toHaveBeenCalled();
  });

  it("explains when the free builds are used up", async () => {
    const { POST } = await import("@/app/api/projects/[id]/fix/route");
    setup(
      server({
        claim_generation: () => ({ error: { message: "free_limit_reached" } }),
      }),
    );
    const res = await POST(post({ threadIds: ["t1"] }), ctx);
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("free_limit");
    expect(state.generate).not.toHaveBeenCalled();
  });
});

describe("generate", () => {
  it("saves a version and bills cost + markup through finish_generation", async () => {
    const { POST } = await import("@/app/api/projects/[id]/generate/route");
    const res = await POST(
      post({ prompt: "make the button blue" }, "generate"),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ versionId: "v2", number: 2 });
    expect(finish()?.args).toMatchObject({ p_status: "succeeded" });
  });

  it("refuses empty prompts before claiming a build", async () => {
    const { POST } = await import("@/app/api/projects/[id]/generate/route");
    const res = await POST(post({ prompt: "  " }, "generate"), ctx);
    expect(res.status).toBe(400);
    expect(state.server.calls.some((c) => c.rpc === "claim_generation")).toBe(
      false,
    );
  });

  it("hits the daily safety cap with a 429", async () => {
    const { POST } = await import("@/app/api/projects/[id]/generate/route");
    setup(
      server({
        claim_generation: () => ({ error: { message: "daily_limit_reached" } }),
      }),
    );
    expect((await POST(post({ prompt: "x" }, "generate"), ctx)).status).toBe(
      429,
    );
  });
});
