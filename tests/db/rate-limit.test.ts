// Fixed-window rate limits.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb } from "./harness";

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(() => db.close());

const hit = async (key: string, limit = 3, window = 60) => {
  await db.asService();
  return db.value<boolean>(`select public.hit_rate_limit($1, $2, $3)`, [
    key,
    limit,
    window,
  ]);
};

describe("hit_rate_limit", () => {
  it("allows up to the limit in a window, then refuses", async () => {
    expect([
      await hit("a"),
      await hit("a"),
      await hit("a"),
      await hit("a"),
    ]).toEqual([true, true, true, false]);
    expect(await hit("b")).toBe(true);
  });

  it("starts over when the window has passed", async () => {
    await db.asAdmin();
    await db.rows(
      `update public.rate_limits set window_start = now() - interval '2 minutes' where key = 'a'`,
    );
    expect(await hit("a")).toBe(true);
  });

  it("isn't callable by visitors", async () => {
    await db.asAnon();
    expect(await db.error(`select public.hit_rate_limit('x', 1, 60)`)).toMatch(
      /permission denied/,
    );
  });
});
