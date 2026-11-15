// Publish-on-push follows commit order, not finishing order.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { project } from "./fixtures";

let db: TestDb;
let owner: TestUser;
let p: Awaited<ReturnType<typeof project>>;

const build = async (sha: string, queuedAgo: string) => {
  await db.asAdmin();
  const v = (await db.value<string>(
    `insert into public.versions (project_id, number, html, source)
     values ($1, (select coalesce(max(number), 0) + 1 from public.versions where project_id = $1), $2, 'github')
     returning id`,
    [p.id, `<html>${sha}</html>`],
  ))!;
  const b = (await db.value<string>(
    `insert into public.builds (project_id, repo_full_name, branch, commit_sha, trigger, status, version_id, queued_at)
     values ($1, 'acme/site', 'main', $2, 'push', 'building', $3, now() - $4::interval) returning id`,
    [p.id, sha, v, queuedAgo],
  ))!;
  return { v, b };
};
const publish = async (buildId: string) => {
  await db.asService();
  return db.value<boolean>(`select public.publish_push_build($1)`, [buildId]);
};
const live = async () => {
  await db.asAdmin();
  return db.value<string>(
    `select live_version_id from public.projects where id = $1`,
    [p.id],
  );
};

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  p = await project(db, owner);
});
afterAll(() => db.close());

describe("publish_push_build", () => {
  it("doesn't let an older commit that finishes late replace a newer one", async () => {
    const older = await build("aaa", "10 minutes");
    const newer = await build("bbb", "2 minutes");
    expect(await publish(newer.b)).toBe(true);
    expect(await publish(older.b)).toBe(false);
    expect(await live()).toBe(newer.v);
  });

  it("publishes a newer commit over an older one", async () => {
    const next = await build("ccc", "1 minute");
    expect(await publish(next.b)).toBe(true);
    expect(await live()).toBe(next.v);
  });
});
