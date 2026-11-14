// Team reviewers: free seats that can comment and approve, but never build.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { addToTeam, invite, project, role, team, thread } from "./fixtures";

let db: TestDb;
let admin: TestUser, builder: TestUser, rev: TestUser;
let teamId: string;

beforeAll(async () => {
  db = await TestDb.create();
  admin = await db.user("admin@acme.co");
  builder = await db.user("builder@acme.co");
  rev = await db.user("rev@acme.co");
  teamId = await team(db, admin);
  await addToTeam(db, teamId, builder, "member");
  await addToTeam(db, teamId, rev, "reviewer");
});
afterAll(() => db.close());

describe("team reviewer role", () => {
  it("gives reviewers commenter access to every team prototype", async () => {
    const p = await project(db, admin, { teamId });
    expect(await role(db, rev, p.id)).toBe("commenter");
    expect(await role(db, builder, p.id)).toBe("editor");
    expect(await role(db, admin, p.id)).toBe("owner");
  });

  it("lets reviewers read versions and comment", async () => {
    const p = await project(db, admin, { teamId });
    await db.as(rev);
    expect((await db.rows(`select id from public.versions where project_id = $1`, [p.id])).length).toBe(1);
    expect(await thread(db, rev, p.id, p.versionId, "Approved from me")).toBeTruthy();
  });

  it("stops reviewers from building, saving versions or editing the prototype", async () => {
    const p = await project(db, admin, { teamId });
    await db.as(rev);
    expect(await db.error(`select public.claim_generation($1)`, [p.id])).toMatch(/forbidden/);
    expect(await db.error(`select public.create_version($1, '<html></html>', 'x', 'x', 'ai')`, [p.id])).toMatch(/not allowed/);
    await db.rows(`update public.projects set name = 'Hacked' where id = $1`, [p.id]);
    await db.asAdmin();
    expect(await db.value(`select name from public.projects where id = $1`, [p.id])).toBe("Checkout");
  });

  it("stops reviewers from creating prototypes in the team", async () => {
    await db.as(rev);
    const err = await db.error(
      `insert into public.projects (owner_id, name, slug, team_id) values ($1, 'Mine', 'rev-proto-1', $2)`,
      [rev.id, teamId],
    );
    expect(err).toMatch(/row-level security/);
  });

  it("can't make a reviewer the owner of a prototype", async () => {
    const p = await project(db, admin, { teamId });
    await db.as(admin);
    expect(await db.error(`select public.transfer_project($1, $2)`, [p.id, rev.id])).toMatch(/builder/);
    expect(await db.error(`select public.transfer_project($1, $2)`, [p.id, builder.id])).toBeNull();
  });

  it("still lets a project-level editor invite override a team reviewer role", async () => {
    const p = await project(db, admin, { teamId });
    await invite(db, admin, p.id, rev.email, "editor");
    expect(await role(db, rev, p.id)).toBe("editor");
  });

  it("counts only builders as paid seats", async () => {
    await db.as(admin);
    expect(await db.value(`select public.team_seat_count($1)`, [teamId])).toBe(2);
    const more = await db.user("rev2@client.com");
    await addToTeam(db, teamId, more, "reviewer");
    await db.as(admin);
    expect(await db.value(`select public.team_seat_count($1)`, [teamId])).toBe(2);
  });

  it("rejects unknown roles", async () => {
    await db.asAdmin();
    expect(
      await db.error(`insert into public.team_members (team_id, email, role, status) values ($1, 'x@y.co', 'owner', 'active')`, [teamId]),
    ).toMatch(/check constraint/);
  });
});
