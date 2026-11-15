// The sweeper: work left behind by requests that never finished gets settled.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { project } from "./fixtures";

let db: TestDb;
let owner: TestUser;
let p: Awaited<ReturnType<typeof project>>;

const gen = async (status: string, ago: string) => {
  await db.asAdmin();
  return (await db.value<string>(
    `insert into public.generations (user_id, project_id, status, created_at)
     values ($1, $2, $3, now() - $4::interval) returning id`,
    [owner.id, p.id, status, ago],
  ))!;
};
const run = async (
  genId: string,
  steps: object[],
  html: string | null,
  idle: string,
) => {
  await db.asAdmin();
  return (await db.value<string>(
    `insert into public.build_runs (project_id, user_id, generation_id, prompt, steps, working_html,
       input_tokens, output_tokens, cost_micros, status, updated_at)
     values ($1, $2, $3, 'Build a shop', $4::jsonb, $5, 1000, 2000, 30000, 'running', now() - $6::interval)
     returning id`,
    [p.id, owner.id, genId, JSON.stringify(steps), html, idle],
  ))!;
};
const sweep = async () => {
  await db.asService();
  return db.one<{
    runs_settled: number;
    runs_failed: number;
    builds_failed: number;
  }>(`select * from public.sweep_stale_work()`);
};
const status = async (id: string) => {
  await db.asAdmin();
  return db.one<{ status: string; billed_micros: number | null }>(
    `select status, billed_micros from public.generations where id = $1`,
    [id],
  );
};

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  p = await project(db, owner);
});
afterAll(() => db.close());

describe("sweep_stale_work", () => {
  it("fails builds stuck for 15 minutes, free, and leaves recent ones alone", async () => {
    const stuck = await gen("started", "20 minutes");
    const fresh = await gen("started", "2 minutes");
    const r = await sweep();
    expect(r.builds_failed).toBe(1);
    expect(await status(stuck)).toMatchObject({
      status: "failed",
      billed_micros: 0,
    });
    expect((await status(fresh)).status).toBe("started");
  });

  it("keeps finished steps of an abandoned planned build as a version and charges for them", async () => {
    const g = await gen("started", "40 minutes");
    const id = await run(
      g,
      [
        { title: "Layout", status: "done" },
        { title: "Checkout", status: "done" },
        { title: "Polish", status: "pending" },
      ],
      "<html><body>Shop</body></html>",
      "20 minutes",
    );
    const r = await sweep();
    expect(r.runs_settled).toBe(1);
    await db.asAdmin();
    const b = await db.one<{ status: string; version_id: string }>(
      `select status, version_id from public.build_runs where id = $1`,
      [id],
    );
    expect(b.status).toBe("failed");
    const v = await db.one<{ html: string; summary: string }>(
      `select html, summary from public.versions where id = $1`,
      [b.version_id],
    );
    expect(v).toMatchObject({
      html: "<html><body>Shop</body></html>",
      summary: "Built 2 of 3 steps before the build stopped.",
    });
    expect((await status(g)).status).toBe("succeeded");
    expect(
      await db.value(
        `select count(*)::int from public.messages where project_id = $1 and version_id = $2`,
        [p.id, b.version_id],
      ),
    ).toBe(1);
  });

  it("ends an abandoned planned build with nothing finished, free", async () => {
    const g = await gen("started", "40 minutes");
    await run(g, [{ title: "Layout", status: "pending" }], null, "20 minutes");
    const r = await sweep();
    expect(r.runs_failed).toBe(1);
    expect(await status(g)).toMatchObject({
      status: "failed",
      billed_micros: 0,
    });
  });

  it("leaves planned builds that are still moving alone, even past 15 minutes", async () => {
    const g = await gen("started", "40 minutes");
    await run(
      g,
      [{ title: "Layout", status: "done" }],
      "<html></html>",
      "1 minute",
    );
    const r = await sweep();
    expect(r).toMatchObject({
      runs_settled: 0,
      runs_failed: 0,
      builds_failed: 0,
    });
    expect((await status(g)).status).toBe("started");
  });

  it("isn't callable by signed-in people", async () => {
    await db.as(owner);
    expect(await db.error(`select * from public.sweep_stale_work()`)).toMatch(
      /permission denied/,
    );
  });
});
