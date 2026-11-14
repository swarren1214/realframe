// Build allowances and what each build is billed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { addToTeam, project, team } from "./fixtures";

let db: TestDb;
let alice: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  alice = await db.user("alice@acme.co");
});
afterAll(() => db.close());

async function claim(user: TestUser, projectId: string) {
  await db.as(user);
  return db.value<string>(`select public.claim_generation($1)`, [projectId]);
}

async function finish(id: string, status: "succeeded" | "failed", cost: number) {
  await db.asService();
  await db.rows(`select public.finish_generation($1, $2, 1000, 2000, $3)`, [id, status, cost]);
  await db.asAdmin();
  return db.one<{ status: string; cost_micros: number; billed_micros: number }>(
    `select status, cost_micros::int, billed_micros::int from public.generations where id = $1`,
    [id],
  );
}

describe("free plan", () => {
  it("allows 30 builds a month, then refuses with free_limit_reached", async () => {
    const bob = await db.user("bob@acme.co");
    const p = await project(db, bob);
    for (let i = 0; i < 30; i++) expect(await claim(bob, p.id)).toBeTruthy();
    await db.as(bob);
    expect(await db.error(`select public.claim_generation($1)`, [p.id])).toMatch(/free_limit_reached/);
    const q = await db.one<{ plan: string; used: number; remaining: number }>(
      `select plan, used, remaining from public.generation_quota()`,
    );
    expect(q).toEqual({ plan: "free", used: 30, remaining: 0 });
  });

  it("respects a per-user override", async () => {
    const carol = await db.user("carol@acme.co");
    await db.rows(`update public.profiles set build_limit_override = 1 where id = $1`, [carol.id]);
    const p = await project(db, carol);
    expect(await claim(carol, p.id)).toBeTruthy();
    await db.as(carol);
    expect(await db.error(`select public.claim_generation($1)`, [p.id])).toMatch(/free_limit_reached/);
  });
});

describe("what a build is billed", () => {
  it("bills a successful build at cost + 50%, rounded up", async () => {
    const p = await project(db, alice);
    const id = (await claim(alice, p.id))!;
    expect(await finish(id, "succeeded", 100_001)).toEqual({
      status: "succeeded",
      cost_micros: 100_001,
      billed_micros: 150_002,
    });
  });

  it("never bills a failed build, even when it reports a cost", async () => {
    const p = await project(db, alice);
    const id = (await claim(alice, p.id))!;
    const g = await finish(id, "failed", 250_000);
    expect(g!.status).toBe("failed");
    expect(g!.billed_micros).toBe(0);
  });

  it("finishes a build only once", async () => {
    const p = await project(db, alice);
    const id = (await claim(alice, p.id))!;
    await finish(id, "succeeded", 1000);
    expect((await finish(id, "succeeded", 9_999_999))!.cost_micros).toBe(1000);
  });

  it("doesn't let users report their own build costs", async () => {
    const p = await project(db, alice);
    const id = (await claim(alice, p.id))!;
    await db.as(alice);
    expect(await db.error(`select public.finish_generation($1, 'succeeded', 1, 1, 0)`, [id])).not.toBeNull();
    expect(await db.error(`update public.generations set billed_micros = 0 where id = $1`, [id])).toBeNull();
    await db.asAdmin();
    // RLS allows no updates: the row is unchanged.
    expect(await db.value(`select status from public.generations where id = $1`, [id])).toBe("started");
  });
});

describe("pro plan", () => {
  it("includes $10 of usage and a 150-builds-a-day safety cap", async () => {
    const pro = await db.user("pro@acme.co");
    await db.rows(
      `update public.profiles set plan = 'pro', current_period_start = now() - interval '3 days', current_period_end = now() + interval '27 days' where id = $1`,
      [pro.id],
    );
    await db.as(pro);
    const q = await db.one<{ plan: string; build_limit: number; included_micros: number }>(
      `select plan, build_limit, included_micros::int from public.generation_quota()`,
    );
    expect(q).toEqual({ plan: "pro", build_limit: 150, included_micros: 10_000_000 });
  });
});

describe("team plan", () => {
  it("bills builds in team prototypes to the team, pooling $10 per seat", async () => {
    const admin = await db.user("admin@team.co");
    const member = await db.user("member@team.co");
    const t = await team(db, admin);
    await addToTeam(db, t, member, "member");
    await db.rows(`update public.teams set plan = 'team', seats = 2, current_period_start = now() - interval '1 day', current_period_end = now() + interval '29 days' where id = $1`, [t]);
    const p = await project(db, admin, { teamId: t });
    await db.as(member);
    const q = await db.one<{ plan: string; included_micros: number; team_id: string }>(
      `select plan, included_micros::int, team_id from public.build_quota($1)`,
      [p.id],
    );
    expect(q).toEqual({ plan: "team", included_micros: 20_000_000, team_id: t });
    const id = (await claim(member, p.id))!;
    await db.asAdmin();
    expect(await db.value(`select team_id from public.generations where id = $1`, [id])).toBe(t);
    // Team builds don't use up the member's own free builds.
    await db.as(member);
    expect(await db.value(`select used from public.generation_quota()`)).toBe(0);
  });
});
