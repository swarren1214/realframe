// Error capture: server errors via instrumentation, browser errors via /api/errors.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase } from "./fake-supabase";

const state: { admin: ReturnType<typeof fakeSupabase>; allowed: boolean } = {
  allowed: true,
} as never;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    fakeSupabase(() => undefined, { id: "u1", email: "a@b.co" }).client,
}));

beforeEach(() => {
  state.allowed = true;
  state.admin = fakeSupabase((c) =>
    c.rpc === "hit_rate_limit" ? { data: state.allowed } : undefined,
  );
});
const inserted = () =>
  state.admin.calls.filter(
    (c) => c.table === "app_errors" && c.op === "insert",
  );

describe("error capture", () => {
  it("records server errors with the route they came from", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    const { onRequestError } = await import("@/instrumentation");
    const err = Object.assign(new Error("boom"), { digest: "123" });
    await onRequestError(
      err,
      { path: "/projects/p1", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/projects/[id]",
        routeType: "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      } as never,
    );
    expect(inserted()[0].values).toMatchObject({
      source: "server",
      message: "boom",
      digest: "123",
      path: "/projects/p1",
      route: "/projects/[id]",
    });
    vi.unstubAllEnvs();
  });

  it("records what the browser reports, with who hit it", async () => {
    const { POST } = await import("@/app/api/errors/route");
    const res = await POST(
      new NextRequest("https://www.realframe.app/api/errors", {
        method: "POST",
        body: JSON.stringify({ message: "x is undefined", path: "/billing" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(inserted()[0].values).toMatchObject({
      source: "client",
      message: "x is undefined",
      path: "/billing",
      user_id: "u1",
    });
  });

  it("limits reports from one address", async () => {
    state.allowed = false;
    const { POST } = await import("@/app/api/errors/route");
    const res = await POST(
      new NextRequest("https://www.realframe.app/api/errors", {
        method: "POST",
        body: JSON.stringify({ message: "spam" }),
      }),
    );
    expect(res.status).toBe(429);
    expect(inserted()).toHaveLength(0);
  });
});
