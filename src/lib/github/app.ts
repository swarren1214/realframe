import "server-only";
import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// The Realframe GitHub App. Its credentials come from env vars when set, otherwise from the
// app_secrets table, where the one-time manifest setup (/api/github/setup) stores them.

export type AppConfig = {
  id: number;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  webhookSecret: string;
};

let cached: AppConfig | null = null;

export async function getAppConfig(): Promise<AppConfig | null> {
  if (cached) return cached;
  const env = process.env;
  if (env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_APP_SLUG) {
    cached = {
      id: Number(env.GITHUB_APP_ID),
      slug: env.GITHUB_APP_SLUG,
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
      webhookSecret: env.GITHUB_WEBHOOK_SECRET ?? "",
    };
    return cached;
  }
  const { data } = await createAdminClient().from("app_secrets").select("value").eq("key", "github_app").maybeSingle();
  if (!data) return null;
  cached = JSON.parse(data.value) as AppConfig;
  return cached;
}

export async function requireAppConfig() {
  const c = await getAppConfig();
  if (!c) throw new Error("GitHub isn't set up for Realframe yet.");
  return c;
}

export async function saveAppConfig(config: AppConfig) {
  const { error } = await createAdminClient()
    .from("app_secrets")
    .upsert({ key: "github_app", value: JSON.stringify(config), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cached = config;
}

// ---- Signed state for OAuth/install round trips ---------------------------------------

function stateKey() {
  const s = process.env.SUPABASE_SECRET_KEY;
  if (!s) throw new Error("SUPABASE_SECRET_KEY is not set.");
  return s;
}

export function signState(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 60_000 })).toString("base64url");
  const sig = createHmac("sha256", stateKey()).update(`gh-state:${body}`).digest("base64url");
  return `${body}.${sig}`;
}

export function readState<T extends Record<string, unknown>>(state: string | null): T | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", stateKey()).update(`gh-state:${body}`).digest("base64url"));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
  return data.exp > Date.now() ? data : null;
}

// ---- API -------------------------------------------------------------------------------

const API = "https://api.github.com";

async function gh<T>(path: string, init: RequestInit & { token: string; tokenType?: "Bearer" | "token" }): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : API + path, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "Realframe",
      authorization: `${init.tokenType ?? "Bearer"} ${init.token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

/** A short-lived JWT that authenticates as the app itself. */
export async function appJwt() {
  const c = await requireAppConfig();
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat: now - 60, exp: now + 9 * 60, iss: String(c.id) })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(c.privateKey).toString("base64url");
  return `${unsigned}.${sig}`;
}

/** An installation token (valid for an hour). Never stored. */
export async function installationToken(installationId: number) {
  const res = await gh<{ token: string }>(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    token: await appJwt(),
  });
  return res.token;
}

export async function getInstallation(installationId: number) {
  return gh<{ id: number; account: { login: string; type: string } | null; suspended_at: string | null }>(
    `/app/installations/${installationId}`,
    { token: await appJwt() },
  );
}

export type Repo = {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  language: string | null;
  pushed_at: string;
  owner: { login: string };
};

export async function listInstallationRepos(installationId: number) {
  const token = await installationToken(installationId);
  const repos: Repo[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await gh<{ repositories: Repo[]; total_count: number }>(`/installation/repositories?per_page=100&page=${page}`, { token });
    repos.push(...res.repositories);
    if (repos.length >= res.total_count || res.repositories.length < 100) break;
  }
  return repos.sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
}

export async function getRepo(token: string, fullName: string) {
  return gh<Repo>(`/repos/${fullName}`, { token });
}

export async function listBranches(token: string, fullName: string) {
  const res = await gh<{ name: string }[]>(`/repos/${fullName}/branches?per_page=100`, { token });
  return res.map((b) => b.name);
}

/** A file's text at a ref, or null when it doesn't exist. */
export async function readRepoFile(token: string, fullName: string, path: string, ref: string) {
  try {
    const res = await gh<{ content?: string; encoding?: string; type: string }>(
      `/repos/${fullName}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      { token },
    );
    if (res.type !== "file" || !res.content) return null;
    return Buffer.from(res.content, (res.encoding as BufferEncoding) ?? "base64").toString("utf8");
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** Every path in the repo at a ref (for finding package.json folders in monorepos). */
export async function listRepoTree(token: string, fullName: string, ref: string) {
  const res = await gh<{ tree: { path: string; type: string }[]; truncated: boolean }>(
    `/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { token },
  );
  return res.tree.filter((t) => t.type === "blob").map((t) => t.path);
}

export async function getCommit(token: string, fullName: string, ref: string) {
  const c = await gh<{ sha: string; commit: { message: string; author: { name: string } | null }; author: { login: string } | null }>(
    `/repos/${fullName}/commits/${encodeURIComponent(ref)}`,
    { token },
  );
  return { sha: c.sha, message: c.commit.message.split("\n")[0].slice(0, 200), author: c.author?.login ?? c.commit.author?.name ?? null };
}

// ---- User authorisation (proving an installation belongs to the signed-in person) --------

export async function exchangeUserCode(code: string) {
  const c = await requireAppConfig();
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, code }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description ?? "GitHub didn't authorize Realframe.");
  return data.access_token;
}

export async function userInstallations(userToken: string) {
  const res = await gh<{ installations: { id: number; account: { login: string; type: string }; suspended_at: string | null }[] }>(
    "/user/installations?per_page=100",
    { token: userToken },
  );
  return res.installations;
}

/** Finishes the manifest flow: GitHub returns the new app's credentials once. */
export async function convertManifest(code: string) {
  const res = await fetch(`${API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", "user-agent": "Realframe" },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = (await res.json()) as {
    id: number;
    slug: string;
    client_id: string;
    client_secret: string;
    pem: string;
    webhook_secret: string;
  };
  return {
    id: d.id,
    slug: d.slug,
    clientId: d.client_id,
    clientSecret: d.client_secret,
    privateKey: d.pem,
    webhookSecret: d.webhook_secret,
  };
}
