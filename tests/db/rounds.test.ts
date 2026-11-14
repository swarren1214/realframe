// Review rounds, approvals and fix from feedback.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { addToTeam, invite, project, role, team, thread } from "./fixtures";

let db: TestDb;
let owner: TestUser, maya: TestUser, jordan: TestUser, stranger: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("steve@acme.co");
  maya = await db.user("maya@acme.co");
  jordan = await db.user("jordan@client.com");
  stranger = await db.user("stranger@else.com");
});
afterAll(() => db.close());

async function request(
  by: TestUser,
  p: { id: string; versionId: string },
  emails: string[],
  rule: "all" | "any" = "all",
) {
  await db.as(by);
  const id = await db.value<string>(
    `select public.request_review($1, $2, $3, 'Focus on payment', now() + interval '3 days', $4)`,
    [p.id, p.versionId, emails, rule],
  );
  await db.asAdmin();
  return id!;
}

async function decide(u: TestUser, round: string, decision: string) {
  await db.as(u);
  const s = await db.value<string>(`select public.decide_review($1, $2)`, [
    round,
    decision,
  ]);
  await db.asAdmin();
  return s;
}

describe("requesting a review", () => {
  it("invites reviewers who don't have access yet as commenters", async () => {
    const p = await project(db, owner, { published: true });
    expect(await role(db, jordan, p.id)).toBeNull();
    const r = await request(owner, p, [
      "Jordan@Client.com ",
      "maya@acme.co",
      "not-an-email",
    ]);
    expect(await role(db, jordan, p.id)).toBe("commenter");
    const reqs = await db.rows(
      `select email, decision from public.review_requests where round_id = $1 order by email`,
      [r],
    );
    expect(reqs).toEqual([
      { email: "jordan@client.com", decision: "pending" },
      { email: "maya@acme.co", decision: "pending" },
    ]);
  });

  it("doesn't add team members as project commenters (they already have access)", async () => {
    const t = await team(db, owner);
    await addToTeam(db, t, maya, "reviewer");
    const p = await project(db, owner, { teamId: t });
    await request(owner, p, [maya.email]);
    expect(
      await db.rows(
        `select * from public.project_members where project_id = $1`,
        [p.id],
      ),
    ).toEqual([]);
    expect(await role(db, maya, p.id)).toBe("commenter");
  });

  it("only lets builders request reviews", async () => {
    const p = await project(db, owner, { published: true });
    await invite(db, owner, p.id, maya.email, "commenter");
    await db.as(maya);
    expect(
      await db.error(`select public.request_review($1, $2, array['x@y.co'])`, [
        p.id,
        p.versionId,
      ]),
    ).toMatch(/Only builders/);
    await db.as(stranger);
    expect(
      await db.error(`select public.request_review($1, $2, array['x@y.co'])`, [
        p.id,
        p.versionId,
      ]),
    ).toMatch(/Only builders/);
  });

  it("rejects a version from another prototype and empty reviewer lists", async () => {
    const a = await project(db, owner);
    const b = await project(db, owner);
    await db.as(owner);
    expect(
      await db.error(`select public.request_review($1, $2, array['x@y.co'])`, [
        a.id,
        b.versionId,
      ]),
    ).toMatch(/isn't part/);
    expect(
      await db.error(`select public.request_review($1, $2, array['nope'])`, [
        a.id,
        a.versionId,
      ]),
    ).toMatch(/at least one/);
  });

  it("closes the previous round when a new one starts", async () => {
    const p = await project(db, owner);
    const r1 = await request(owner, p, [maya.email]);
    const r2 = await request(owner, p, [maya.email]);
    const rows = await db.rows<{ id: string; closed: boolean }>(
      `select id, closed_at is not null as closed from public.review_rounds where project_id = $1 order by created_at`,
      [p.id],
    );
    expect(rows).toEqual([
      { id: r1, closed: true },
      { id: r2, closed: false },
    ]);
  });
});

describe("approving", () => {
  it("with rule 'all', approves only when everyone has", async () => {
    const p = await project(db, owner);
    const r = await request(owner, p, [maya.email, jordan.email], "all");
    expect(await decide(maya, r, "approved")).toBe("open");
    expect(await decide(jordan, r, "approved")).toBe("approved");
  });

  it("with rule 'any', approves on the first approval", async () => {
    const p = await project(db, owner);
    const r = await request(owner, p, [maya.email, jordan.email], "any");
    expect(await decide(jordan, r, "approved")).toBe("approved");
  });

  it("marks the round changes_requested if anyone asks for changes, and recovers when they change their mind", async () => {
    const p = await project(db, owner);
    const r = await request(owner, p, [maya.email, jordan.email], "any");
    await decide(maya, r, "approved");
    expect(await decide(jordan, r, "changes_requested")).toBe(
      "changes_requested",
    );
    expect(await decide(jordan, r, "approved")).toBe("approved");
    expect(await decide(jordan, r, "pending")).toBe("approved");
  });

  it("only lets the people asked answer", async () => {
    const p = await project(db, owner, { published: true, access: "public" });
    const r = await request(owner, p, [maya.email]);
    await db.as(stranger);
    expect(
      await db.error(`select public.decide_review($1, 'approved')`, [r]),
    ).toMatch(/weren't asked/);
    await db.as(owner);
    expect(
      await db.error(`select public.decide_review($1, 'approved')`, [r]),
    ).toMatch(/weren't asked/);
  });

  it("stops answers once the round is closed", async () => {
    const p = await project(db, owner);
    const r = await request(owner, p, [maya.email]);
    await db.as(maya);
    expect(await db.error(`select public.close_review($1)`, [r])).toMatch(
      /Only builders/,
    );
    await db.as(owner);
    await db.rows(`select public.close_review($1)`, [r]);
    await db.as(maya);
    expect(
      await db.error(`select public.decide_review($1, 'approved')`, [r]),
    ).toMatch(/closed/);
  });

  it("matches a reviewer who signs up after being asked", async () => {
    const p = await project(db, owner);
    const r = await request(owner, p, ["newbie@client.com"]);
    const newbie = await db.user("newbie@client.com");
    expect(await decide(newbie, r, "approved")).toBe("approved");
  });

  it("lets reviewers see the round, and hides it from strangers", async () => {
    const p = await project(db, owner);
    const r = await request(owner, p, [maya.email]);
    await db.as(maya);
    expect(
      (await db.rows(`select id from public.review_rounds where id = $1`, [r]))
        .length,
    ).toBe(1);
    await db.as(stranger);
    expect(
      await db.rows(`select id from public.review_rounds where id = $1`, [r]),
    ).toEqual([]);
    expect(
      await db.rows(
        `select email from public.review_requests where round_id = $1`,
        [r],
      ),
    ).toEqual([]);
  });

  it("doesn't allow writing rounds directly", async () => {
    const p = await project(db, owner);
    const r = await request(owner, p, [maya.email]);
    await db.as(maya);
    await db.rows(
      `update public.review_requests set decision = 'approved' where round_id = $1`,
      [r],
    );
    await db.asAdmin();
    expect(
      await db.value(
        `select decision from public.review_requests where round_id = $1`,
        [r],
      ),
    ).toBe("pending");
  });
});

describe("fix from feedback", () => {
  it("lets builders mark threads addressed in a new version", async () => {
    const p = await project(db, owner, { published: true });
    await invite(db, owner, p.id, maya.email);
    const t1 = await thread(db, maya, p.id, p.versionId, "Bigger button");
    const t2 = await thread(db, maya, p.id, p.versionId, "Wrong color");
    await db.as(owner);
    const v2 = await db.value<string>(
      `select id from public.create_version($1, '<html></html>', 'fix', 'Fixed', 'ai')`,
      [p.id],
    );
    expect(
      await db.value(`select public.mark_threads_addressed($1, $2, $3)`, [
        p.id,
        [t1],
        v2,
      ]),
    ).toBe(1);
    await db.asAdmin();
    const rows = await db.rows(
      `select id, addressed_version_id, status from public.comment_threads where project_id = $1 order by created_at`,
      [p.id],
    );
    expect(rows).toEqual([
      { id: t1, addressed_version_id: v2, status: "open" },
      { id: t2, addressed_version_id: null, status: "open" },
    ]);
  });

  it("doesn't let commenters mark feedback addressed, directly or through the function", async () => {
    const p = await project(db, owner, { published: true });
    await invite(db, owner, p.id, maya.email);
    const t = await thread(db, maya, p.id, p.versionId);
    await db.as(maya);
    expect(
      await db.error(`select public.mark_threads_addressed($1, $2, $3)`, [
        p.id,
        [t],
        p.versionId,
      ]),
    ).toMatch(/Only builders/);
    expect(
      await db.error(
        `update public.comment_threads set addressed_version_id = $2 where id = $1`,
        [t, p.versionId],
      ),
    ).toMatch(/Only builders/);
    // Resolving still works for commenters.
    expect(
      await db.error(
        `update public.comment_threads set status = 'resolved' where id = $1`,
        [t],
      ),
    ).toBeNull();
  });

  it("only marks threads on the same prototype", async () => {
    const a = await project(db, owner, { published: true });
    const b = await project(db, owner, { published: true });
    const tb = await thread(db, owner, b.id, b.versionId);
    await db.as(owner);
    expect(
      await db.value(`select public.mark_threads_addressed($1, $2, $3)`, [
        a.id,
        [tb],
        a.versionId,
      ]),
    ).toBe(0);
  });
});
