// Planned builds run in background calls with no signed-in user: their versions are saved
// by the service role, attributed to the person who started the run.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { project } from "./fixtures";

let db: TestDb;
let owner: TestUser;
let p: Awaited<ReturnType<typeof project>>;
let runId: string;

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  p = await project(db, owner);
  await db.asAdmin();
  const gen = await db.value<string>(
    `insert into public.generations (user_id, project_id, status) values ($1, $2, 'started') returning id`,
    [owner.id, p.id],
  );
  runId = (await db.value<string>(
    `insert into public.build_runs (project_id, user_id, generation_id, prompt, steps, status)
     values ($1, $2, $3, 'Build a shop', '[]'::jsonb, 'running') returning id`,
    [p.id, owner.id, gen],
  ))!;
});
afterAll(() => db.close());

describe("create_run_version", () => {
  it("saves the next version as the run's owner", async () => {
    await db.asAdmin();
    const before = (await db.value<number>(
      `select coalesce(max(number), 0) from public.versions where project_id = $1`,
      [p.id],
    ))!;
    await db.asService();
    const v = await db.one<{ number: number; created_by: string; prompt: string; html: string }>(
      `select number, created_by, prompt, html from public.create_run_version($1, '<html>v</html>', 'Built it')`,
      [runId],
    );
    expect(v).toMatchObject({
      number: before + 1,
      created_by: owner.id,
      prompt: "Build a shop",
      html: "<html>v</html>",
    });
  });

  it("can't be called by signed-in users", async () => {
    await db.as(owner);
    expect(
      await db.error(
        `select public.create_run_version($1, '<html>x</html>', 'x')`,
        [runId],
      ),
    ).toMatch(/permission denied/);
  });

  it("records step progress on the run", async () => {
    await db.asService();
    await db.value(`update public.build_runs set progress_chars = 2048 where id = $1 returning id`, [runId]);
    await db.as(owner);
    expect(
      await db.value<number>(`select progress_chars from public.build_runs where id = $1`, [runId]),
    ).toBe(2048);
  });
});
