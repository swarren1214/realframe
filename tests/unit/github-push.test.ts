// pushFiles and ensurePullRequest against a stubbed GitHub API.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

type Seen = { method: string; path: string; body: unknown };
let seen: Seen[];
let branchExists: boolean;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });

beforeEach(() => {
  seen = [];
  branchExists = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace("https://api.github.com", "");
      const method = init.method ?? "GET";
      seen.push({
        method,
        path,
        body: init.body ? JSON.parse(String(init.body)) : null,
      });
      if (path === "/repos/acme/site") return json({ default_branch: "main" });
      if (path === "/repos/acme/site/git/ref/heads/main")
        return json({ object: { sha: "main-sha" } });
      if (path.startsWith("/repos/acme/site/git/ref/heads/"))
        return branchExists
          ? json({ object: { sha: "branch-sha" } })
          : json({ message: "Not Found" }, 404);
      if (path.startsWith("/repos/acme/site/git/commits/"))
        return json({ tree: { sha: "base-tree" } });
      if (path === "/repos/acme/site/git/trees")
        return json({ sha: "new-tree" });
      if (path === "/repos/acme/site/git/commits")
        return json({
          sha: "new-commit",
          html_url: "https://github.com/acme/site/commit/new-commit",
        });
      if (path.startsWith("/repos/acme/site/git/refs")) return json({});
      if (path.startsWith("/repos/acme/site/pulls?")) return json([]);
      if (path === "/repos/acme/site/pulls")
        return json({
          html_url: "https://github.com/acme/site/pull/9",
          number: 9,
        });
      return json({ message: `unexpected ${method} ${path}` }, 500);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const files = [{ path: "web/index.html", content: "<html></html>" }];

describe("pushFiles", () => {
  it("starts a new branch from the default branch", async () => {
    const { pushFiles } = await import("@/lib/github/app");
    const out = await pushFiles("t", "acme/site", {
      branch: "realframe/x-v1",
      message: "Export",
      files,
    });
    expect(out).toMatchObject({
      created: true,
      defaultBranch: "main",
      sha: "new-commit",
    });
    const tree = seen.find((s) => s.path === "/repos/acme/site/git/trees")!;
    expect(tree.body).toMatchObject({
      base_tree: "base-tree",
      tree: [{ path: "web/index.html", mode: "100644", type: "blob" }],
    });
    const commit = seen.find(
      (s) => s.path === "/repos/acme/site/git/commits" && s.method === "POST",
    )!;
    expect(commit.body).toMatchObject({ parents: ["main-sha"] });
    expect(seen.at(-1)).toMatchObject({
      method: "POST",
      path: "/repos/acme/site/git/refs",
      body: { ref: "refs/heads/realframe/x-v1", sha: "new-commit" },
    });
  });

  it("adds a commit on top of an existing branch without forcing", async () => {
    branchExists = true;
    const { pushFiles } = await import("@/lib/github/app");
    const out = await pushFiles("t", "acme/site", {
      branch: "realframe/x-v1",
      message: "Export",
      files,
    });
    expect(out.created).toBe(false);
    const commit = seen.find(
      (s) => s.path === "/repos/acme/site/git/commits" && s.method === "POST",
    )!;
    expect(commit.body).toMatchObject({ parents: ["branch-sha"] });
    expect(seen.at(-1)).toMatchObject({
      method: "PATCH",
      path: "/repos/acme/site/git/refs/heads/realframe/x-v1",
      body: { sha: "new-commit", force: false },
    });
  });
});

describe("ensurePullRequest", () => {
  it("opens one when none is open for the branch", async () => {
    const { ensurePullRequest } = await import("@/lib/github/app");
    const pr = await ensurePullRequest("t", "acme/site", {
      branch: "realframe/x-v1",
      base: "main",
      title: "Export",
      body: "",
    });
    expect(pr).toEqual({
      url: "https://github.com/acme/site/pull/9",
      number: 9,
      created: true,
    });
    expect(seen[0].path).toContain(encodeURIComponent("acme:realframe/x-v1"));
  });
});
