import { randomUUID } from "node:crypto";
import type { TestDb, TestUser } from "./harness";

const HTML = "<!doctype html><html><body><h1>Hi</h1></body></html>";

/** The user's personal team id (made by the signup trigger). */
export async function personalTeam(db: TestDb, user: TestUser) {
  await db.asAdmin();
  return (await db.value<string>(
    `select t.id from public.teams t join public.team_members m on m.team_id = t.id
     where t.personal and m.user_id = $1`,
    [user.id],
  ))!;
}

/** A prototype owned by `owner` with one version, created the way the app does it. */
export async function project(
  db: TestDb,
  owner: TestUser,
  opts: { teamId?: string; published?: boolean; access?: "invite" | "public" } = {},
) {
  const teamId = opts.teamId ?? (await personalTeam(db, owner));
  const id = randomUUID();
  const slug = `proto-${id.slice(0, 8)}`;
  await db.as(owner);
  await db.rows(
    `insert into public.projects (id, owner_id, name, slug, team_id) values ($1, $2, 'Checkout', $3, $4)`,
    [id, owner.id, slug, teamId],
  );
  const v = await db.one<{ id: string; number: number }>(
    `select id, number from public.create_version($1, $2, 'make a page', 'Made it', 'ai')`,
    [id, HTML],
  );
  if (opts.published) {
    await db.rows(
      `update public.projects set published = true, live_version_id = $2, access_mode = $3 where id = $1`,
      [id, v!.id, opts.access ?? "invite"],
    );
  }
  await db.asAdmin();
  return { id, slug, versionId: v!.id, teamId };
}

/** Adds `email` to a prototype as a project member (as the owner would). */
export async function invite(
  db: TestDb,
  owner: TestUser,
  projectId: string,
  email: string,
  role: "viewer" | "commenter" | "editor" = "commenter",
) {
  await db.as(owner);
  await db.rows(
    `insert into public.project_members (project_id, email, role, invited_by) values ($1, $2, $3, $4)`,
    [projectId, email.toLowerCase(), role, owner.id],
  );
  await db.asAdmin();
}

/** Adds a user to a team directly (as an accepted invite). */
export async function addToTeam(
  db: TestDb,
  teamId: string,
  user: TestUser,
  role: "admin" | "member" | "reviewer" = "member",
) {
  await db.asAdmin();
  await db.rows(
    `insert into public.team_members (team_id, email, user_id, role, status) values ($1, $2, $3, $4, 'active')`,
    [teamId, user.email, user.id, role],
  );
}

/** A non-personal team with `admin` as its admin. */
export async function team(db: TestDb, admin: TestUser, name = "Acme") {
  await db.as(admin);
  const id = (await db.value<string>(`select public.create_team($1)`, [name]))!;
  await db.asAdmin();
  return id;
}

/** Starts a comment thread as `user` and returns its id. */
export async function thread(
  db: TestDb,
  user: TestUser,
  projectId: string,
  versionId: string,
  body = "Looks off",
) {
  await db.as(user);
  const id = await db.value<string>(
    `select public.create_thread($1, $2, 0.5, 0.5, $3)`,
    [projectId, versionId, body],
  );
  await db.asAdmin();
  return id!;
}

export const role = async (db: TestDb, user: TestUser, projectId: string) => {
  await db.as(user);
  const r = await db.value<string | null>(`select public.project_role($1)`, [
    projectId,
  ]);
  await db.asAdmin();
  return r ?? null;
};
