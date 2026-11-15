// Dev mode on the review page: guests can inspect only once the owner turns it on.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { invite, project } from "./fixtures";

let db: TestDb;
let owner: TestUser;
let viewer: TestUser;
let p: Awaited<ReturnType<typeof project>>;

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  viewer = await db.user("viewer@acme.co");
  p = await project(db, owner);
  await invite(db, owner, p.id, viewer.email, "viewer");
});
afterAll(() => db.close());

const flag = () =>
  db.value<boolean>(`select guest_inspect from public.projects where id = $1`, [
    p.id,
  ]);

describe("guest inspect", () => {
  it("is off by default", async () => {
    await db.asAdmin();
    expect(await flag()).toBe(false);
  });

  it("lets the owner turn it on, and not a viewer", async () => {
    await db.as(viewer);
    await db.rows(
      `update public.projects set guest_inspect = true where id = $1`,
      [p.id],
    );
    await db.asAdmin();
    expect(await flag()).toBe(false);
    await db.as(owner);
    await db.rows(
      `update public.projects set guest_inspect = true where id = $1`,
      [p.id],
    );
    await db.asAdmin();
    expect(await flag()).toBe(true);
  });
});
