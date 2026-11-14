// Annual plans keep a monthly usage allowance.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { addMonths, usageWindow } from "@/lib/usage-window";
import { PLANS } from "@/lib/plans";
import { addToTeam, project, team } from "./fixtures";

let db: TestDb;
let u: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  u = await db.user("annual@acme.co");
});
afterAll(() => db.close());

const win = async (anchor: string, at: string) =>
  db.one<{ s: string; e: string }>(
    `select to_char(window_start at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI') s,
            to_char(window_end at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI') e
     from public.usage_window($1, $2)`,
    [anchor, at],
  );

describe("usage_window()", () => {
  const cases: [string, string, string, string][] = [
    [
      "2026-01-15T10:00Z",
      "2026-01-20T00:00Z",
      "2026-01-15T10:00",
      "2026-02-15T10:00",
    ],
    [
      "2026-01-15T10:00Z",
      "2026-03-15T09:59Z",
      "2026-02-15T10:00",
      "2026-03-15T10:00",
    ],
    [
      "2026-01-15T10:00Z",
      "2026-03-15T10:00Z",
      "2026-03-15T10:00",
      "2026-04-15T10:00",
    ],
    [
      "2026-01-31T00:00Z",
      "2026-02-28T12:00Z",
      "2026-02-28T00:00",
      "2026-03-31T00:00",
    ],
    [
      "2026-01-31T00:00Z",
      "2026-04-30T00:00Z",
      "2026-04-30T00:00",
      "2026-05-31T00:00",
    ],
    [
      "2027-12-31T23:00Z",
      "2028-02-29T23:30Z",
      "2028-02-29T23:00",
      "2028-03-31T23:00",
    ],
  ];
  it.each(cases)("anchor %s at %s", async (anchor, at, s, e) => {
    expect(await win(anchor, at)).toEqual({ s, e });
  });

  it("agrees with the TypeScript window math used by the billing cron", async () => {
    for (const [anchor, at] of cases) {
      const ts = usageWindow(new Date(anchor), new Date(at));
      const sql = await win(anchor, at);
      expect(ts.start.toISOString().slice(0, 16)).toBe(sql!.s);
      expect(ts.end.toISOString().slice(0, 16)).toBe(sql!.e);
    }
  });
});

describe("plan settings", () => {
  it("match the plan facts the app shows", async () => {
    const s = await db.one<{
      free_monthly_builds: number;
      pro_daily_builds: number;
      pro_included_micros: string;
      usage_markup: string;
    }>(`select * from public.plan_settings()`);
    expect(s!.free_monthly_builds).toBe(PLANS.free.monthlyBuilds);
    expect(s!.pro_daily_builds).toBe(PLANS.pro.dailyBuildCap);
    expect(Number(s!.pro_included_micros)).toBe(
      PLANS.pro.includedUsdPerMonth * 1_000_000,
    );
    expect(Number(s!.usage_markup)).toBe(PLANS.usageMarkup);
  });
});

describe("annual Pro quota", () => {
  it("reports this month's window and usage, not the whole year", async () => {
    const start = addMonths(new Date(), -3);
    start.setUTCHours(start.getUTCHours() - 1);
    await db.rows(
      `update public.profiles set plan = 'pro', billing_interval = 'year', current_period_start = $2, current_period_end = $3 where id = $1`,
      [u.id, start.toISOString(), addMonths(start, 12).toISOString()],
    );
    const p = await project(db, u);
    // Usage two months ago doesn't count against this month's $10.
    await db.rows(
      `insert into public.generations (user_id, project_id, status, billed_micros, created_at) values
         ($1, $2, 'succeeded', 9000000, now() - interval '2 months'),
         ($1, $2, 'succeeded', 1500000, now() - interval '1 hour')`,
      [u.id, p.id],
    );
    await db.as(u);
    const q = await db.one<{
      plan: string;
      usage_micros: string;
      included_micros: string;
      period_start: Date;
      period_end: Date;
    }>(
      `select plan, usage_micros, included_micros, period_start, period_end from public.generation_quota()`,
    );
    const expected = usageWindow(start, new Date());
    expect(q!.plan).toBe("pro");
    expect(Number(q!.usage_micros)).toBe(1_500_000);
    expect(Number(q!.included_micros)).toBe(10_000_000);
    expect(new Date(q!.period_start).toISOString()).toBe(
      expected.start.toISOString(),
    );
    expect(new Date(q!.period_end).toISOString()).toBe(
      expected.end.toISOString(),
    );
  });

  it("monthly Pro still reports the billing period", async () => {
    const m = await db.user("monthly@acme.co");
    await db.rows(
      `update public.profiles set plan = 'pro', current_period_start = '2026-11-01T00:00Z', current_period_end = '2026-12-01T00:00Z' where id = $1`,
      [m.id],
    );
    await db.as(m);
    const q = await db.one<{ period_start: Date }>(
      `select period_start from public.generation_quota()`,
    );
    expect(new Date(q!.period_start).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
  });
});

describe("annual Team quota", () => {
  it("pools $10 per builder seat for the current month", async () => {
    const admin = await db.user("tadmin@acme.co");
    const b = await db.user("tb@acme.co");
    const t = await team(db, admin);
    await addToTeam(db, t, b, "member");
    const start = addMonths(new Date(), -5);
    await db.rows(
      `update public.teams set plan = 'team', seats = 2, billing_interval = 'year', current_period_start = $2, current_period_end = $3 where id = $1`,
      [t, start.toISOString(), addMonths(start, 12).toISOString()],
    );
    const p = await project(db, admin, { teamId: t });
    await db.as(b);
    const q = await db.one<{
      plan: string;
      included_micros: string;
      period_start: Date;
    }>(
      `select plan, included_micros, period_start from public.build_quota($1)`,
      [p.id],
    );
    expect(q!.plan).toBe("team");
    expect(Number(q!.included_micros)).toBe(20_000_000);
    expect(new Date(q!.period_start).toISOString()).toBe(
      usageWindow(start, new Date()).start.toISOString(),
    );
  });
});
