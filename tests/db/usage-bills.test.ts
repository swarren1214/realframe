// Usage billing in the database: totals and stamps with no row limit, and one ledger row per window.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { project } from "./fixtures";

let db: TestDb;
let owner: TestUser;
let p: Awaited<ReturnType<typeof project>>;
const FROM = "2026-03-01T00:00:00Z";
const TO = "2026-04-01T00:00:00Z";

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  p = await project(db, owner);
  await db.asAdmin();
  // 2,500 finished builds in March at 4,000 micros each, plus one still running and one in April.
  await db.rows(
    `insert into public.generations (user_id, project_id, status, billed_micros, created_at)
     select $1, $2, 'succeeded', 4000, timestamptz '2026-03-02' + (g * interval '10 minutes')
     from generate_series(1, 2500) g`,
    [owner.id, p.id],
  );
  await db.rows(
    `insert into public.generations (user_id, project_id, status, created_at) values ($1, $2, 'started', '2026-03-20')`,
    [owner.id, p.id],
  );
  await db.rows(
    `insert into public.generations (user_id, project_id, status, billed_micros, created_at) values ($1, $2, 'succeeded', 9, '2026-04-02')`,
    [owner.id, p.id],
  );
});
afterAll(() => db.close());

const total = () =>
  db.one<{ billed_micros: string; builds: number }>(
    `select * from public.unbilled_usage($1, null, $2, $3)`,
    [owner.id, FROM, TO],
  );

describe("usage billing functions", () => {
  it("totals every finished build in the window, past any row limit", async () => {
    await db.asService();
    const t = await total();
    expect(t.builds).toBe(2500);
    expect(Number(t.billed_micros)).toBe(10_000_000);
  });

  it("stamps them all in one go, and leaves running builds and other months alone", async () => {
    await db.asService();
    expect(
      await db.value(`select public.stamp_usage($1, null, $2, $3, 'in_1')`, [
        owner.id,
        FROM,
        TO,
      ]),
    ).toBe(2500);
    expect((await total()).builds).toBe(0);
    await db.asAdmin();
    expect(
      await db.value(
        `select count(*)::int from public.generations where billed_invoice_id is null`,
      ),
    ).toBe(2);
  });

  it("keeps one ledger row per account and window", async () => {
    await db.asService();
    const first = await db.one<{ id: string }>(
      `select * from public.claim_usage_bill('user', $1, $2, $3)`,
      [owner.id, FROM, TO],
    );
    await db.asAdmin();
    await db.rows(
      `update public.usage_bills set invoice_id = 'in_1' where id = $1`,
      [first.id],
    );
    await db.asService();
    const again = await db.one<{ id: string; invoice_id: string }>(
      `select * from public.claim_usage_bill('user', $1, $2, $3)`,
      [owner.id, FROM, TO],
    );
    expect(again).toMatchObject({ id: first.id, invoice_id: "in_1" });
  });

  it("isn't callable by signed-in people", async () => {
    await db.as(owner);
    expect(
      await db.error(`select * from public.unbilled_usage($1, null, $2, $3)`, [
        owner.id,
        FROM,
        TO,
      ]),
    ).toMatch(/permission denied/);
  });
});
