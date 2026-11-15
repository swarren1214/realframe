// Usage & billing: build kinds, the spend cap, usage alerts and the Usage tab's data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { addToTeam, project, team } from "./fixtures";

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(() => db.close());

async function pro(email: string) {
  const u = await db.user(email);
  await db.asAdmin();
  await db.rows(
    `update public.profiles set plan = 'pro', current_period_start = now() - interval '3 days',
       current_period_end = now() + interval '27 days' where id = $1`,
    [u.id],
  );
  return u;
}

async function claim(user: TestUser, projectId: string, kind?: string) {
  await db.as(user);
  return (await db.value<string>(
    kind
      ? `select public.claim_generation($1, $2)`
      : `select public.claim_generation($1)`,
    kind ? [projectId, kind] : [projectId],
  ))!;
}

/** Claims and finishes a build that's billed `billed` micros (cost = billed / 1.5). */
async function build(
  user: TestUser,
  projectId: string,
  billed: number,
  status: "succeeded" | "failed" = "succeeded",
  kind?: string,
) {
  const id = await claim(user, projectId, kind);
  await db.asService();
  await db.rows(`select public.finish_generation($1, $2, 1000, 2000, $3)`, [
    id,
    status,
    Math.round(billed / 1.5),
  ]);
  await db.asAdmin();
  return id;
}

async function inbox(user: TestUser) {
  await db.asAdmin();
  return db.rows<{ kind: string; body: string }>(
    `select kind, body from public.notifications where user_id = $1 and kind in ('usage_alert', 'spend_cap') order by created_at`,
    [user.id],
  );
}

describe("build kinds", () => {
  it("defaults to build and stores the kind a route passes", async () => {
    const u = await db.user("kinds@acme.co");
    const p = await project(db, u);
    const a = await claim(u, p.id);
    const b = await claim(u, p.id, "variant");
    await db.asAdmin();
    expect(
      await db.rows(
        `select kind from public.generations where id in ($1, $2) order by kind`,
        [a, b],
      ),
    ).toEqual([{ kind: "build" }, { kind: "variant" }]);
  });

  it("refuses an unknown kind", async () => {
    const u = await db.user("badkind@acme.co");
    const p = await project(db, u);
    await db.as(u);
    expect(
      await db.error(`select public.claim_generation($1, 'mining')`, [p.id]),
    ).toMatch(/bad_kind/);
  });

  it("records how long a build took when it finishes", async () => {
    const u = await db.user("duration@acme.co");
    const p = await project(db, u);
    const id = await claim(u, p.id);
    await db.asAdmin();
    await db.rows(
      `update public.generations set created_at = now() - interval '42 seconds' where id = $1`,
      [id],
    );
    await db.asService();
    await db.rows(
      `select public.finish_generation($1, 'succeeded', 1, 1, 10)`,
      [id],
    );
    await db.asAdmin();
    const ms = await db.value<number>(
      `select duration_ms from public.generations where id = $1`,
      [id],
    );
    expect(ms).toBeGreaterThanOrEqual(42_000);
    expect(ms).toBeLessThan(60_000);
  });
});

describe("spend cap", () => {
  it("refuses new builds once this period's billed usage reaches the cap", async () => {
    const u = await pro("cap@acme.co");
    const p = await project(db, u);
    await db.as(u);
    await db.rows(
      `update public.profiles set spend_cap_micros = 3000000 where id = $1`,
      [u.id],
    );
    await build(u, p.id, 2_000_000);
    expect(await claim(u, p.id)).toBeTruthy(); // $2 of $3: still allowed
    await db.asService();
    await db.rows(
      `update public.generations set status = 'failed' where user_id = $1 and status = 'started'`,
      [u.id],
    );
    await build(u, p.id, 1_000_000);
    await db.as(u);
    expect(
      await db.error(`select public.claim_generation($1)`, [p.id]),
    ).toMatch(/spend_cap_reached/);
    // Raising the cap lets building continue.
    await db.rows(
      `update public.profiles set spend_cap_micros = 10000000 where id = $1`,
      [u.id],
    );
    expect(await claim(u, p.id)).toBeTruthy();
  });

  it("doesn't count failed builds toward the cap", async () => {
    const u = await pro("capfail@acme.co");
    const p = await project(db, u);
    await db.as(u);
    await db.rows(
      `update public.profiles set spend_cap_micros = 1000000 where id = $1`,
      [u.id],
    );
    await build(u, p.id, 5_000_000, "failed");
    expect(await claim(u, p.id)).toBeTruthy();
  });

  it("only lets people change their own cap and thresholds, not what was sent", async () => {
    const u = await db.user("grants@acme.co");
    await db.as(u);
    expect(
      await db.error(
        `update public.profiles set spend_cap_micros = 5, alert_thresholds = '{80}' where id = $1`,
        [u.id],
      ),
    ).toBeNull();
    expect(
      await db.error(
        `update public.profiles set alerts_sent = '{}' where id = $1`,
        [u.id],
      ),
    ).toMatch(/permission denied/);
    expect(
      await db.error(
        `update public.profiles set alert_thresholds = '{33}' where id = $1`,
        [u.id],
      ),
    ).toMatch(/check constraint/);
  });
});

describe("usage alerts", () => {
  it("posts each threshold once a period, for the highest one a build crosses", async () => {
    const u = await pro("alerts@acme.co");
    const p = await project(db, u);
    await build(u, p.id, 4_000_000); // 40%
    expect(await inbox(u)).toEqual([]);
    await build(u, p.id, 1_500_000); // 55%
    await build(u, p.id, 1_000_000); // 65%: nothing new
    await build(u, p.id, 2_000_000); // 85%
    const n = await inbox(u);
    expect(n.map((x) => x.kind)).toEqual(["usage_alert", "usage_alert"]);
    expect(n[0].body).toMatch(/^50% .*\$5\.50 of \$10\.00/);
    expect(n[1].body).toMatch(/^80% .*\$8\.50 of \$10\.00/);
  });

  it("jumps straight to the highest threshold crossed and posts the cap once", async () => {
    const u = await pro("jump@acme.co");
    const p = await project(db, u);
    await db.as(u);
    await db.rows(
      `update public.profiles set spend_cap_micros = 12000000 where id = $1`,
      [u.id],
    );
    await build(u, p.id, 12_500_000);
    const n = await inbox(u);
    expect(n.map((x) => x.kind)).toEqual(["usage_alert", "spend_cap"]);
    expect(n[0].body).toMatch(/^100%/);
    expect(n[1].body).toMatch(/\$12\.00 reached/);
  });

  it("never alerts on the free plan", async () => {
    const u = await db.user("freealerts@acme.co");
    const p = await project(db, u);
    await build(u, p.id, 50_000_000);
    expect(await inbox(u)).toEqual([]);
  });

  it("sends team alerts to the team's admins", async () => {
    const admin = await db.user("teamadmin@acme.co");
    const member = await db.user("teammember@acme.co");
    const t = await team(db, admin, "Alerting");
    await addToTeam(db, t, member);
    await db.rows(
      `update public.teams set plan = 'team', seats = 1, current_period_start = now() - interval '1 day',
         current_period_end = now() + interval '29 days' where id = $1`,
      [t],
    );
    const p = await project(db, member, { teamId: t });
    await build(member, p.id, 6_000_000);
    expect((await inbox(admin)).map((x) => x.kind)).toEqual(["usage_alert"]);
    expect(await inbox(member)).toEqual([]);
    expect(
      await db.value(
        `select team_id from public.notifications where user_id = $1 and kind = 'usage_alert'`,
        [admin.id],
      ),
    ).toBe(t);
  });
});

describe("the Usage tab", () => {
  it("summarises this period by kind, day and project", async () => {
    const u = await pro("overview@acme.co");
    const a = await project(db, u);
    const b = await project(db, u);
    await build(u, a.id, 300_000);
    await build(u, a.id, 150_000, "succeeded", "fix");
    await build(u, b.id, 600_000, "succeeded", "variant");
    await build(u, b.id, 900_000, "failed");
    await db.as(u);
    const o = (await db.value<Record<string, unknown>>(
      `select public.usage_overview()`,
    ))!;
    expect(o).toMatchObject({
      plan: "pro",
      usage_micros: 1_050_000,
      included_micros: 10_000_000,
      builds: 3,
      failed: 1,
      by_kind: { build: 300_000, fix: 150_000, variant: 600_000 },
    });
    const byProject = o.by_project as { project_id: string; micros: number }[];
    expect(byProject.map((x) => [x.project_id, x.micros])).toEqual([
      [b.id, 600_000],
      [a.id, 450_000],
    ]);
    expect(
      (o.daily as { micros: number }[]).reduce((s, d) => s + d.micros, 0),
    ).toBe(1_050_000);
  });

  it("lists builds newest first, filters them, and keeps people to their own", async () => {
    const u = await pro("ledger@acme.co");
    const other = await pro("ledger-other@acme.co");
    const p = await project(db, u);
    const q = await project(db, other);
    await build(u, p.id, 150_000);
    await build(u, p.id, 300_000, "succeeded", "fix");
    await build(other, q.id, 999_000);
    await db.as(u);
    const rows = await db.rows<{ kind: string; billed_micros: number }>(
      `select kind, billed_micros::int from public.usage_ledger()`,
    );
    expect(rows).toEqual([
      { kind: "fix", billed_micros: 300_000 },
      { kind: "build", billed_micros: 150_000 },
    ]);
    expect(
      await db.rows(`select kind from public.usage_ledger(p_kind => 'fix')`),
    ).toEqual([{ kind: "fix" }]);
  });

  it("shows a team's members their own builds and admins everyone's", async () => {
    const admin = await db.user("ladmin@acme.co");
    const m1 = await db.user("lm1@acme.co");
    const m2 = await db.user("lm2@acme.co");
    const outsider = await db.user("lout@acme.co");
    const t = await team(db, admin, "Ledger team");
    await addToTeam(db, t, m1);
    await addToTeam(db, t, m2);
    await db.rows(
      `update public.teams set plan = 'team', seats = 3 where id = $1`,
      [t],
    );
    const p = await project(db, m1, { teamId: t });
    await build(m1, p.id, 150_000);
    await build(m2, p.id, 300_000);
    await db.as(m1);
    expect(
      await db.value(`select count(*)::int from public.usage_ledger($1)`, [t]),
    ).toBe(1);
    const mo = (await db.value<Record<string, unknown>>(
      `select public.usage_overview($1)`,
      [t],
    ))!;
    expect(mo).toMatchObject({
      usage_micros: 450_000,
      see_all: false,
      by_member: [],
    });
    await db.as(admin);
    expect(
      await db.value(`select count(*)::int from public.usage_ledger($1)`, [t]),
    ).toBe(2);
    const ao = (await db.value<Record<string, unknown>>(
      `select public.usage_overview($1)`,
      [t],
    ))!;
    expect((ao.by_member as unknown[]).length).toBe(2);
    await db.as(outsider);
    expect(await db.error(`select public.usage_overview($1)`, [t])).toMatch(
      /forbidden/,
    );
  });
});
