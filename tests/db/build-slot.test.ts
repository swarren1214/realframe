// One build at a time per prototype: a second build that would save a version is refused.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { invite, project } from "./fixtures";

let db: TestDb;
let owner: TestUser;
let editor: TestUser;
let p: Awaited<ReturnType<typeof project>>;

const claim = async (u: TestUser, kind = "build") => {
  await db.as(u);
  return db.value<string>(`select public.claim_generation($1, $2)`, [
    p.id,
    kind,
  ]);
};
const refused = async (u: TestUser, kind = "build") => {
  await db.as(u);
  return db.error(`select public.claim_generation($1, $2)`, [p.id, kind]);
};

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  editor = await db.user("editor@acme.co");
  p = await project(db, owner);
  await invite(db, owner, p.id, editor.email, "editor");
  await db.asAdmin();
  await db.rows(
    `update public.profiles set display_name = 'Dana' where id = $1`,
    [editor.id],
  );
});
beforeEach(async () => {
  await db.asAdmin();
  await db.rows(`delete from public.build_runs`);
  await db.rows(`delete from public.generations`);
});
afterAll(() => db.close());

describe("build slot", () => {
  it("refuses a second build while one is running, naming who's building", async () => {
    await claim(editor);
    expect(await refused(owner)).toMatch(/build_in_progress: Dana/);
    expect(await refused(owner, "fix")).toMatch(/build_in_progress/);
    expect(await refused(editor)).toMatch(/build_in_progress: you/);
  });

  it("frees the slot when the build ends", async () => {
    const id = await claim(editor);
    await db.asService();
    await db.rows(
      `select public.finish_generation($1, 'succeeded', 10, 10, 100)`,
      [id],
    );
    expect(await claim(owner)).toBeTruthy();
  });

  it("lets variants and exports run alongside a build", async () => {
    await claim(editor);
    expect(await claim(owner, "variant")).toBeTruthy();
    expect(await claim(owner, "variant")).toBeTruthy();
    expect(await claim(owner, "export")).toBeTruthy();
  });

  it("ignores a build stuck for over 15 minutes", async () => {
    const id = await claim(editor);
    await db.asAdmin();
    await db.rows(
      `update public.generations set created_at = now() - interval '20 minutes' where id = $1`,
      [id],
    );
    expect(await claim(owner)).toBeTruthy();
  });

  it("keeps the slot for a long planned build whose steps are still moving", async () => {
    const id = await claim(editor);
    await db.asAdmin();
    await db.rows(
      `update public.generations set created_at = now() - interval '40 minutes' where id = $1`,
      [id],
    );
    await db.rows(
      `insert into public.build_runs (project_id, user_id, generation_id, prompt, steps, status, updated_at)
       values ($1, $2, $3, 'Shop', '[]'::jsonb, 'running', now() - interval '1 minute')`,
      [p.id, editor.id, id],
    );
    expect(await refused(owner)).toMatch(/build_in_progress: Dana/);
  });
});
