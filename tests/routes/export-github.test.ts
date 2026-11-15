// Push to GitHub: who can push, what's checked, and how GitHub's answers come back.
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type Call, type Handler } from "./fake-supabase";

const state: {
  server: ReturnType<typeof fakeSupabase>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  push: Mock<(...a: any[]) => Promise<any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pr: Mock<(...a: any[]) => Promise<any>>;
} = {} as never;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.server.client,
}));
vi.mock("@/lib/github/app", () => ({
  installationToken: async () => "ghs_test",
  pushFiles: (...a: unknown[]) => state.push(...a),
  ensurePullRequest: (...a: unknown[]) => state.pr(...a),
  installationSettingsUrl: (id: number, a: { login: string; type: string }) =>
    a.type === "Organization"
      ? `https://github.com/organizations/${a.login}/settings/installations/${id}`
      : `https://github.com/settings/installations/${id}`,
}));

const V = "00000000-0000-0000-0000-0000000000a1";

function server(
  over: Partial<Record<string, (c: Call) => unknown>> = {},
): Handler {
  return (c) => {
    if (c.rpc && over[c.rpc]) return over[c.rpc]!(c) as never;
    if (c.table && over[c.table]) return over[c.table]!(c) as never;
    if (c.rpc === "project_role") return { data: "editor" };
    if (c.table === "github_installations")
      return {
        data: {
          id: 42,
          account_login: "Hearth-Software-LLC",
          account_type: "Organization",
          suspended_at: null,
        },
      };
    if (c.table === "versions")
      return {
        data: {
          id: V,
          number: 3,
          project_id: "p1",
          projects: { name: "Trip planner" },
        },
      };
  };
}

function setup(handler: Handler = server()) {
  state.server = fakeSupabase(handler, { id: "u1", email: "steve@acme.co" });
  state.push = vi.fn(async () => ({
    sha: "abc",
    commitUrl: "https://github.com/acme/site/commit/abc",
    created: true,
    defaultBranch: "main",
  }));
  state.pr = vi.fn(async () => ({
    url: "https://github.com/acme/site/pull/7",
    number: 7,
    created: true,
  }));
}

const body = (over: object = {}) => ({
  installationId: 42,
  repo: "acme/site",
  branch: "realframe/trip-planner-v3",
  folder: "prototypes/trip",
  format: "zip",
  versionId: V,
  files: [
    { path: "index.html", content: "<html></html>" },
    { path: "styles.css", content: "body{}" },
  ],
  ...over,
});
const post = (b: unknown) =>
  new NextRequest("https://www.realframe.app/api/projects/p1/export/github", {
    method: "POST",
    body: JSON.stringify(b),
  });
const ctx = { params: Promise.resolve({ id: "p1" }) };
const route = () => import("@/app/api/projects/[id]/export/github/route");

beforeEach(() => setup());

describe("push to GitHub", () => {
  it("commits the files under the folder and opens a pull request", async () => {
    const { POST } = await route();
    const res = await POST(post(body()), ctx);
    expect(res.status).toBe(200);
    const [, repo, opts] = state.push.mock.calls[0];
    expect(repo).toBe("acme/site");
    expect(opts.branch).toBe("realframe/trip-planner-v3");
    expect(opts.files.map((f: { path: string }) => f.path)).toEqual([
      "prototypes/trip/index.html",
      "prototypes/trip/styles.css",
    ]);
    expect(opts.message).toBe("Export Trip planner v3 from Realframe");
    expect(state.pr.mock.calls[0][2]).toMatchObject({
      branch: "realframe/trip-planner-v3",
      base: "main",
    });
    const data = await res.json();
    expect(data.pullRequest.number).toBe(7);
    expect(
      state.server.calls.find((c) => c.table === "exports" && c.op === "insert")
        ?.values,
    ).toMatchObject({ format: "zip", scope: "prototype" });
  });

  it("skips the pull request when asked, or when pushing to the default branch", async () => {
    const { POST } = await route();
    await POST(post(body({ pullRequest: false })), ctx);
    await POST(post(body({ branch: "main" })), ctx);
    expect(state.pr).not.toHaveBeenCalled();
  });

  it("only lets owners and editors push", async () => {
    setup(server({ project_role: () => ({ data: "commenter" }) }));
    const { POST } = await route();
    expect((await POST(post(body()), ctx)).status).toBe(403);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("refuses installations the person can't use", async () => {
    setup(server({ github_installations: () => ({ data: null }) }));
    const { POST } = await route();
    expect((await POST(post(body()), ctx)).status).toBe(403);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("refuses unsafe paths, folders and branch names", async () => {
    const { POST } = await route();
    for (const b of [
      body({ files: [{ path: "../etc/passwd", content: "x" }] }),
      body({ files: [{ path: ".git/config", content: "x" }] }),
      body({ folder: "../up" }),
      body({ branch: "bad..name" }),
      body({ branch: "-x" }),
      body({ repo: "not a repo" }),
    ])
      expect((await POST(post(b), ctx)).status).toBe(400);
    expect(state.push).not.toHaveBeenCalled();
  });

  it("points at GitHub settings when the app can't write yet", async () => {
    state.push.mockRejectedValueOnce(
      Object.assign(
        new Error("GitHub 403: Resource not accessible by integration"),
        {
          status: 403,
        },
      ),
    );
    const { POST } = await route();
    const res = await POST(post(body()), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      code: "github_permission",
      settingsUrl:
        "https://github.com/organizations/Hearth-Software-LLC/settings/installations/42",
    });
  });
});
