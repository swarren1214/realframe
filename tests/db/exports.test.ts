// Export log: builders record their exports; owners see every export of their prototype.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { invite, project } from "./fixtures";

let db: TestDb;
let owner: TestUser;
let editor: TestUser;
let viewer: TestUser;
let p: Awaited<ReturnType<typeof project>>;

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  editor = await db.user("editor@acme.co");
  viewer = await db.user("viewer@acme.co");
  p = await project(db, owner);
  await invite(db, owner, p.id, editor.email, "editor");
  await invite(db, owner, p.id, viewer.email, "viewer");
});
afterAll(() => db.close());

const log = (u: TestUser, format = "zip") =>
  db.error(
    `insert into public.exports (project_id, version_id, user_id, scope, format) values ($1, $2, $3, 'prototype', $4)`,
    [p.id, p.versionId, u.id, format],
  );

describe("export log", () => {
  it("lets builders log their own exports", async () => {
    await db.as(editor);
    expect(await log(editor)).toBeNull();
    await db.as(owner);
    expect(await log(owner, "html")).toBeNull();
  });

  it("refuses viewers, other people's names and unknown formats", async () => {
    await db.as(viewer);
    expect(await log(viewer)).toMatch(/row-level security/);
    await db.as(editor);
    expect(await log(owner)).toMatch(/row-level security/);
    expect(await log(editor, "pdf")).toMatch(/check constraint/);
  });

  it("shows owners every export and others their own", async () => {
    await db.as(owner);
    expect(await db.value(`select count(*)::int from public.exports`)).toBe(2);
    await db.as(editor);
    expect(await db.value(`select count(*)::int from public.exports`)).toBe(1);
  });

  it("counts AI exports as builds of kind export", async () => {
    await db.as(editor);
    const g = await db.value<string>(
      `select public.claim_generation($1, 'export')`,
      [p.id],
    );
    await db.asAdmin();
    expect(
      await db.value(`select kind from public.generations where id = $1`, [g]),
    ).toBe("export");
  });
});
