// Storage retention: which bundle files can be removed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { TestDb, type TestUser } from "./harness";
import { project } from "./fixtures";

let db: TestDb;
let owner: TestUser;
let p: Awaited<ReturnType<typeof project>>;

const file = (bundle: string, path: string, ago: string) =>
  db.rows(
    `insert into storage.objects (bucket_id, name, created_at) values ('bundles', $1, now() - $2::interval)`,
    [`${p.id}/${bundle}/${path}`, ago],
  );
const bundleVersion = async (ago: string) => {
  const bundle = randomUUID();
  const id = (await db.value<string>(
    `insert into public.versions (project_id, number, html, kind, bundle_id, source, created_at)
     values ($1, (select coalesce(max(number), 0) + 1 from public.versions where project_id = $1), '', 'bundle', $2, 'import', now() - $3::interval)
     returning id`,
    [p.id, bundle, ago],
  ))!;
  await file(bundle, "index.html", ago);
  return { id, bundle };
};

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  p = await project(db, owner);
});
afterAll(() => db.close());

describe("bundle_files_to_prune", () => {
  it("removes orphaned uploads after a day and old unused versions after 90 days", async () => {
    await db.asAdmin();
    const orphanOld = randomUUID();
    const orphanNew = randomUUID();
    await file(orphanOld, "index.html", "2 days");
    await file(orphanNew, "index.html", "2 hours");
    await file("uploads", `${randomUUID()}.zip`, "200 days");

    // 12 old bundle versions: the 10 newest are kept, plus the live one.
    const old = [];
    for (let i = 0; i < 12; i++) old.push(await bundleVersion("120 days"));
    await db.rows(
      `update public.projects set live_version_id = $1 where id = $2`,
      [old[0].id, p.id],
    );

    await db.asService();
    const rows = await db.rows<{ bundle_id: string; reason: string }>(
      `select bundle_id, reason from public.bundle_files_to_prune(1000)`,
    );
    expect(rows).toContainEqual({ bundle_id: orphanOld, reason: "orphan" });
    expect(rows.map((r) => r.bundle_id)).not.toContain(orphanNew);
    // Of 12: the oldest (#1) is live and kept, the 10 newest (#3–#12) are kept; #2 goes.
    expect(
      rows.filter((r) => r.reason === "old").map((r) => r.bundle_id),
    ).toEqual([old[1].bundle]);
    expect(rows.some((r) => r.bundle_id === null)).toBe(false);
  });

  it("isn't callable by signed-in people", async () => {
    await db.as(owner);
    expect(
      await db.error(`select * from public.bundle_files_to_prune(10)`),
    ).toMatch(/permission denied/);
  });
});
