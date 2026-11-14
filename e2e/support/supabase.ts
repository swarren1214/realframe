// Test-only helpers for signed-in E2E flows: make users, sign them in without an inbox, and call
// RPCs as them. They need a Supabase project made for tests (never production):
//   E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY, E2E_SUPABASE_SECRET_KEY
// and a deployment of this branch pointed at it with REALFRAME_FAKE_AI=1.
import type { Page } from "@playwright/test";

export const E2E = {
  url: process.env.E2E_SUPABASE_URL ?? "",
  anon: process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? "",
  secret: process.env.E2E_SUPABASE_SECRET_KEY ?? "",
};
// Signed-in flows need a deployment wired to the test project, not the local build.
export const hasSupabase = Boolean(
  E2E.url && E2E.anon && E2E.secret && process.env.E2E_BASE_URL,
);

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${E2E.url}${path}`, {
    ...init,
    headers: {
      apikey: E2E.secret,
      authorization: `Bearer ${E2E.secret}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

export type E2EUser = {
  id: string;
  email: string;
  name: string;
  token: string;
};

/** A fresh, onboarded user with a unique address. */
export async function createUser(name: string): Promise<E2EUser> {
  const email = `e2e-${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const res = await admin("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!res.ok)
    throw new Error(`create user: ${res.status} ${await res.text()}`);
  const { id } = (await res.json()) as { id: string };
  await admin(`/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      display_name: name,
      onboarded_at: new Date().toISOString(),
    }),
  });
  return { id, email, name, token: await accessToken(email) };
}

async function hashedToken(email: string) {
  const res = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok)
    throw new Error(`generate link: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    hashed_token?: string;
    properties?: { hashed_token: string };
  };
  return body.hashed_token ?? body.properties!.hashed_token;
}

async function accessToken(email: string) {
  const res = await fetch(`${E2E.url}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: E2E.anon, "content-type": "application/json" },
    body: JSON.stringify({
      type: "magiclink",
      token_hash: await hashedToken(email),
    }),
  });
  if (!res.ok) throw new Error(`verify: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Signs the browser in through the app's own magic-link callback. */
export async function signIn(page: Page, user: E2EUser, next = "/projects") {
  const token = await hashedToken(user.email);
  await page.goto(
    `/auth/callback?token_hash=${token}&type=magiclink&next=${encodeURIComponent(next)}`,
  );
}

/** Calls a Postgres function as the user (RLS applies, like the app). */
export async function rpc<T = unknown>(
  user: E2EUser,
  fn: string,
  args: Record<string, unknown>,
) {
  const res = await fetch(`${E2E.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: E2E.anon,
      authorization: `Bearer ${user.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Reads rows as the user. */
export async function select<T = Record<string, unknown>>(
  user: E2EUser,
  query: string,
) {
  const res = await fetch(`${E2E.url}/rest/v1/${query}`, {
    headers: { apikey: E2E.anon, authorization: `Bearer ${user.token}` },
  });
  if (!res.ok) throw new Error(`${query}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

/** Writes as the server (setup only, e.g. a plan). */
export async function adminPatch(
  table: string,
  filter: string,
  values: Record<string, unknown>,
) {
  const res = await admin(`/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
  if (!res.ok)
    throw new Error(`patch ${table}: ${res.status} ${await res.text()}`);
}
