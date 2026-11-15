// Email digest claims: small batches, ids on each item, and failed sends put back (three tries).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";

let db: TestDb;
let people: TestUser[];

beforeAll(async () => {
  db = await TestDb.create();
  people = [];
  for (let i = 0; i < 30; i++) people.push(await db.user(`p${i}@acme.co`));
  await db.asAdmin();
  for (const u of people)
    await db.rows(
      `insert into public.notifications (user_id, kind, body, created_at)
       values ($1, 'comment', 'Looks good', now() - interval '5 minutes')`,
      [u.id],
    );
});
afterAll(() => db.close());

type Row = { user_id: string; items: { id: string; kind: string }[] };
const claim = async (limit: number) => {
  await db.asService();
  return db.rows<Row>(`select * from public.claim_notification_digest($1)`, [
    limit,
  ]);
};

describe("notification digest", () => {
  it("hands out a small batch, each item with its id", async () => {
    const rows = await claim(25);
    expect(rows).toHaveLength(25);
    expect(rows[0].items[0]).toMatchObject({
      kind: "comment",
      id: expect.any(String),
    });
    expect(await claim(25)).toHaveLength(5);
    expect(await claim(25)).toHaveLength(0);
  });

  it("puts a failed send back for the next run, up to three tries", async () => {
    const u = people[0];
    await db.asAdmin();
    const id = (await db.value<string>(
      `select id from public.notifications where user_id = $1`,
      [u.id],
    ))!;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await db.asService();
      const back = await db.value<number>(
        `select public.release_notification_digest($1, $2)`,
        [u.id, [id]],
      );
      expect(back).toBe(attempt < 3 ? 1 : 0);
      if (attempt < 3) {
        const rows = await claim(25);
        expect(rows.map((r) => r.user_id)).toEqual([u.id]);
      }
    }
  });

  it("isn't callable by signed-in people", async () => {
    await db.as(people[1]);
    expect(
      await db.error(`select * from public.claim_notification_digest(25)`),
    ).toMatch(/permission denied/);
  });

  it("stops the old database schedule", async () => {
    await db.asAdmin();
    expect(
      await db.value<number>(
        `select count(*)::int from cron.job where jobname = 'realframe-notification-digest'`,
      ),
    ).toBe(0);
  });
});
