// The sweeper cron: needs the cron secret; fails repo builds that outlived their function and
// restarts queued builds whose runner call was lost.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type Handler } from "./fake-supabase";

const state: { admin: ReturnType<typeof fakeSupabase> } = {} as never;
const started: string[] = [];
const stopped: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("@/lib/builds/run", () => ({
  BUILD_STALE_MS: 14 * 60_000,
  appOrigin: () => "https://www.realframe.app",
  startRunner: async (id: string) => {
    started.push(id);
  },
}));
const resumed: string[] = [];
vi.mock("@/lib/plan-runner", async (orig) => {
  const real = await orig<typeof import("@/lib/plan-runner")>();
  return {
    ...real,
    startRunStep: async (id: string) => {
      resumed.push(id);
    },
  };
});
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    get: async ({ name }: { name: string }) => ({
      stop: async () => {
        stopped.push(name);
      },
    }),
  },
}));

const req = (auth?: string) =>
  new NextRequest("https://www.realframe.app/api/cron/sweep", {
    headers: auth ? { authorization: auth } : {},
  });

function setup(handler: Handler) {
  state.admin = fakeSupabase(handler);
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  started.length = 0;
  stopped.length = 0;
  resumed.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("sweep cron", () => {
  it("refuses callers without the cron secret", async () => {
    setup(() => undefined);
    const { GET } = await import("@/app/api/cron/sweep/route");
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });

  it("settles stuck work, stops stuck sandboxes and starts one queued build per prototype", async () => {
    setup((c) => {
      if (c.rpc === "sweep_stale_work")
        return {
          data: [{ runs_settled: 1, runs_failed: 0, builds_failed: 2 }],
        };
      if (c.table === "builds" && c.op === "update")
        return { data: [{ id: "b1", project_id: "p1", sandbox_id: "sbx-1" }] };
      if (c.table === "builds" && c.op === "select") {
        const filters = JSON.stringify(c.filters);
        if (filters.includes('"queued"'))
          return {
            data: [
              { id: "q-new", project_id: "p2" },
              { id: "q-old", project_id: "p2" },
              { id: "q-busy", project_id: "p3" },
            ],
          };
        return { data: [{ project_id: "p3" }] };
      }
    });
    const { GET } = await import("@/app/api/cron/sweep/route");
    const res = await GET(req("Bearer cron-secret"));
    expect(await res.json()).toMatchObject({
      runs_settled: 1,
      builds_failed: 2,
      repo_builds_failed: 1,
      repo_builds_started: 1,
    });
    expect(stopped).toEqual(["sbx-1"]);
    expect(started).toEqual(["q-new"]);
  });

  it("restarts planned builds whose step hand-off was lost, and leaves moving ones alone", async () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    setup((c) => {
      if (c.table === "build_runs" && c.op === "select")
        return {
          data: [
            { id: "lost", status: "running", running_step: null, updated_at: ago(2 * 60_000) },
            { id: "handing-off", status: "running", running_step: null, updated_at: ago(5_000) },
            { id: "building", status: "running", running_step: 1, updated_at: ago(2 * 60_000) },
            { id: "dead-step", status: "running", running_step: 1, updated_at: ago(8 * 60_000) },
          ],
        };
    });
    const { GET } = await import("@/app/api/cron/sweep/route");
    const res = await GET(req("Bearer cron-secret"));
    expect(await res.json()).toMatchObject({ plan_runs_resumed: 2 });
    expect(resumed).toEqual(["lost", "dead-step"]);
  });
});
