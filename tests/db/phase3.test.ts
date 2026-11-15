// Phase 3 edge cases: prorated seats, archived prototypes, UTC months.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { project } from "./fixtures";

let db: TestDb;
let owner: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
});
afterAll(() => db.close());

describe("prorated seats", () => {
  it("averages a team's seats over a period, weighted by time", async () => {
    await db.asAdmin();
    const team = (await db.value<string>(
      `insert into public.teams (name, seats) values ('Acme', 2) returning id`,
    ))!;
    // 2 seats until Mar 11, then 6 for the rest of March (31 days: 10 at 2, 21 at 6).
    await db.rows(
      `update public.team_seat_history set changed_at = '2026-01-01' where team_id = $1`,
      [team],
    );
    await db.rows(`update public.teams set seats = 6 where id = $1`, [team]);
    await db.rows(
      `update public.team_seat_history set changed_at = '2026-03-11' where team_id = $1 and seats = 6`,
      [team],
    );
    await db.asService();
    const avg = Number(
      await db.value(
        `select public.team_average_seats($1, '2026-03-01', '2026-04-01')`,
        [team],
      ),
    );
    expect(avg).toBeCloseTo((2 * 10 + 6 * 21) / 31, 5);
    expect(
      Number(
        await db.value(
          `select public.team_average_seats($1, '2026-04-01', '2026-05-01')`,
          [team],
        ),
      ),
    ).toBe(6);
  });
});

describe("archived prototypes", () => {
  it("refuse new builds until restored", async () => {
    const p = await project(db, owner);
    await db.asAdmin();
    await db.rows(
      `update public.projects set archived_at = now() where id = $1`,
      [p.id],
    );
    await db.as(owner);
    expect(
      await db.error(`select public.claim_generation($1)`, [p.id]),
    ).toMatch(/project_archived/);
    await db.asAdmin();
    await db.rows(
      `update public.projects set archived_at = null where id = $1`,
      [p.id],
    );
    await db.as(owner);
    expect(
      await db.value(`select public.claim_generation($1)`, [p.id]),
    ).toBeTruthy();
  });
});
