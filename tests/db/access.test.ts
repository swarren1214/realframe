// Who can see and change a prototype. These run the production RLS policies and RPCs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, type TestUser } from "./harness";
import { addToTeam, invite, project, role, team, thread } from "./fixtures";

let db: TestDb;
let owner: TestUser, reviewer: TestUser, stranger: TestUser, teammate: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  owner = await db.user("owner@acme.co");
  reviewer = await db.user("reviewer@client.com");
  stranger = await db.user("stranger@else.com");
  teammate = await db.user("teammate@acme.co");
});
afterAll(() => db.close());

describe("signup", () => {
  it("creates a profile and a personal team for every new user", async () => {
    const p = await db.one(`select email, plan from public.profiles where id = $1`, [owner.id]);
    expect(p).toEqual({ email: "owner@acme.co", plan: "free" });
    const teams = await db.rows(
      `select t.personal, m.role from public.teams t join public.team_members m on m.team_id = t.id where m.user_id = $1`,
      [owner.id],
    );
    expect(teams).toEqual([{ personal: true, role: "admin" }]);
  });
  it("links pending invites to the account when the invitee signs up", async () => {
    const p = await project(db, owner);
    await invite(db, owner, p.id, "later@client.com");
    const later = await db.user("later@client.com");
    expect(await role(db, later, p.id)).toBe("commenter");
    const m = await db.one(`select user_id from public.project_members where project_id = $1`, [p.id]);
    expect(m!.user_id).toBe(later.id);
  });
});

describe("prototype roles", () => {
  it("gives the owner 'owner' and a stranger nothing", async () => {
    const p = await project(db, owner);
    expect(await role(db, owner, p.id)).toBe("owner");
    expect(await role(db, stranger, p.id)).toBeNull();
  });

  it("hides unpublished prototypes and their versions from strangers", async () => {
    const p = await project(db, owner);
    await db.as(stranger);
    expect(await db.rows(`select id from public.projects where id = $1`, [p.id])).toEqual([]);
    expect(await db.rows(`select id from public.versions where project_id = $1`, [p.id])).toEqual([]);
  });

  it("lets anyone read only the live version of a public prototype", async () => {
    const p = await project(db, owner, { published: true, access: "public" });
    await db.as(owner);
    await db.rows(`select public.create_version($1, '<html><body>v2</body></html>', 'p', 's', 'ai')`, [p.id]);
    expect(await role(db, stranger, p.id)).toBe("public");
    await db.as(stranger);
    const seen = await db.rows<{ id: string }>(`select id from public.versions where project_id = $1`, [p.id]);
    expect(seen.map((v) => v.id)).toEqual([p.versionId]);
  });

  it("lets an invited commenter comment but not build", async () => {
    const p = await project(db, owner, { published: true });
    await invite(db, owner, p.id, reviewer.email);
    expect(await role(db, reviewer, p.id)).toBe("commenter");
    const t = await thread(db, reviewer, p.id, p.versionId, "Bigger button");
    expect(t).toBeTruthy();
    await db.as(reviewer);
    expect(await db.error(`select public.create_version($1, '<html></html>', 'x', 'x', 'ai')`, [p.id])).toMatch(/not allowed/);
    expect(await db.error(`select public.claim_generation($1)`, [p.id])).toMatch(/forbidden/);
  });

  it("stops viewers from commenting and strangers from commenting at all", async () => {
    const p = await project(db, owner, { published: true });
    await invite(db, owner, p.id, "viewer@client.com", "viewer");
    const viewer = await db.user("viewer@client.com");
    await db.as(viewer);
    expect(await db.error(`select public.create_thread($1, $2, 0.1, 0.1, 'hi')`, [p.id, p.versionId])).not.toBeNull();
    await db.as(stranger);
    expect(await db.error(`select public.create_thread($1, $2, 0.1, 0.1, 'hi')`, [p.id, p.versionId])).not.toBeNull();
  });

  it("only lets the owner invite people", async () => {
    const p = await project(db, owner);
    await db.as(stranger);
    expect(
      await db.error(
        `insert into public.project_members (project_id, email, role) values ($1, 'x@y.com', 'editor')`,
        [p.id],
      ),
    ).not.toBeNull();
  });

  it("gives team members editor access to the team's prototypes", async () => {
    const t = await team(db, owner);
    await addToTeam(db, t, teammate, "member");
    const p = await project(db, owner, { teamId: t });
    expect(await role(db, teammate, p.id)).toBe("editor");
    await db.as(teammate);
    expect(await db.error(`select public.create_version($1, '<html><body>t</body></html>', 'x', 'x', 'ai')`, [p.id])).toBeNull();
  });
});

describe("versions", () => {
  it("numbers versions in order", async () => {
    const p = await project(db, owner);
    await db.as(owner);
    const v2 = await db.one<{ number: number }>(`select number from public.create_version($1, '<html></html>', 'p', 's', 'restore')`, [p.id]);
    expect(v2!.number).toBe(2);
  });
});

describe("password links", () => {
  it("checks the password server-side only", async () => {
    const p = await project(db, owner, { published: true });
    await db.as(owner);
    await db.rows(`select public.set_project_password($1, 'hunter22')`, [p.id]);
    await db.as(stranger);
    expect(await db.error(`select public.check_project_password($1, 'hunter22')`, [p.slug])).not.toBeNull();
    expect(await db.error(`select * from public.project_secrets`)).not.toBeNull();
    await db.asService();
    const ok = await db.rows(`select * from public.check_project_password($1, 'hunter22')`, [p.slug]);
    const bad = await db.rows(`select * from public.check_project_password($1, 'wrong')`, [p.slug]);
    expect(ok.length).toBe(1);
    expect(JSON.stringify(bad)).not.toEqual(JSON.stringify(ok));
  });
});
