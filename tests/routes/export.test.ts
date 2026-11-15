// The export route: who can export, what's logged, and what an AI export costs.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type Call, type Handler } from "./fake-supabase";

const state: {
  server: ReturnType<typeof fakeSupabase>;
  admin: ReturnType<typeof fakeSupabase>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  convert: Mock<(...a: any[]) => Promise<any>>;
} = {} as never;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.server.client,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("@/lib/export-ai", () => ({
  exportWithAi: (...a: unknown[]) => state.convert(...a),
}));

const V = "00000000-0000-0000-0000-0000000000a1";

function server(
  over: Partial<Record<string, (c: Call) => unknown>> = {},
): Handler {
  return (c) => {
    if (c.rpc && over[c.rpc]) return over[c.rpc]!(c) as never;
    if (c.rpc === "project_role") return { data: "editor" };
    if (c.rpc === "claim_generation") return { data: "claim-1" };
    if (c.table === "versions")
      return {
        data: { id: V, html: "<html><body>Hi</body></html>", kind: "html" },
      };
  };
}

function setup(handler: Handler = server()) {
  state.server = fakeSupabase(handler, { id: "u1", email: "steve@acme.co" });
  state.admin = fakeSupabase();
  state.convert = vi.fn(async () => ({
    files: [
      { path: "PlanCard.tsx", content: "export function PlanCard() {}\n" },
    ],
    usage: { input: 1000, output: 2000 },
  }));
}

const post = (body: unknown) =>
  new NextRequest("https://www.realframe.app/api/projects/p1/export", {
    method: "POST",
    body: JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "p1" }) };
const inserts = () =>
  state.server.calls.filter((c) => c.table === "exports" && c.op === "insert");
const finish = () =>
  state.admin.calls.find((c) => c.rpc === "finish_generation");

beforeEach(() => setup());

describe("export", () => {
  it("logs a file export without claiming a build", async () => {
    const { POST } = await import("@/app/api/projects/[id]/export/route");
    const res = await POST(post({ format: "zip", versionId: V }), ctx);
    expect(res.status).toBe(200);
    expect(inserts()[0]?.values).toMatchObject({
      format: "zip",
      scope: "prototype",
      generation_id: null,
    });
    expect(state.server.calls.some((c) => c.rpc === "claim_generation")).toBe(
      false,
    );
  });

  it("runs an AI component export as an export build and logs it", async () => {
    const { POST } = await import("@/app/api/projects/[id]/export/route");
    const res = await POST(
      post({
        format: "part-react",
        versionId: V,
        selection: [
          {
            label: "Plan card",
            selector: "main > div",
            html: "<div>Crew</div>",
            css: ".c{}",
          },
        ],
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).files[0].path).toBe("PlanCard.tsx");
    expect(
      state.server.calls.find((c) => c.rpc === "claim_generation")?.args,
    ).toMatchObject({
      p_kind: "export",
    });
    expect(state.convert.mock.calls[0][1]).toMatchObject({
      name: "Plan card",
      html: "<div>Crew</div>",
    });
    expect(finish()?.args).toMatchObject({ p_status: "succeeded" });
    expect(inserts()[0]?.values).toMatchObject({
      format: "part-react",
      scope: "selection",
      generation_id: "claim-1",
      selectors: [{ label: "Plan card", selector: "main > div" }],
    });
  });

  it("bills nothing when the AI export fails", async () => {
    const { POST } = await import("@/app/api/projects/[id]/export/route");
    state.convert.mockRejectedValueOnce(new Error("nope"));
    const res = await POST(post({ format: "react", versionId: V }), ctx);
    expect(res.status).toBe(502);
    expect(finish()?.args).toMatchObject({
      p_status: "failed",
      p_cost_micros: 0,
    });
    expect(inserts()).toHaveLength(0);
  });

  it("needs a selection for part formats and a builder role", async () => {
    const { POST } = await import("@/app/api/projects/[id]/export/route");
    expect(
      (await POST(post({ format: "part-html", versionId: V }), ctx)).status,
    ).toBe(400);
    setup(server({ project_role: () => ({ data: "viewer" }) }));
    expect(
      (await POST(post({ format: "zip", versionId: V }), ctx)).status,
    ).toBe(403);
  });

  it("passes on a reached spend cap", async () => {
    const { POST } = await import("@/app/api/projects/[id]/export/route");
    setup(
      server({
        claim_generation: () => ({ error: { message: "spend_cap_reached" } }),
      }),
    );
    const res = await POST(post({ format: "react", versionId: V }), ctx);
    expect(res.status).toBe(402);
    expect(state.convert).not.toHaveBeenCalled();
  });
});
