// Runs Realframe's real migrations against Postgres compiled to WebAssembly (PGlite), with
// small stand-ins for the parts of Supabase the migrations touch: auth.uid()/auth.jwt(), the
// anon/authenticated/service_role roles, storage buckets and the realtime publication.
// Each test file gets a fresh database, so tests can't leak state into each other.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS = join(__dirname, "..", "..", "supabase", "migrations");

const SUPABASE_STANDINS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema extensions;
create extension pgcrypto schema extensions;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

create publication supabase_realtime;

-- pg_cron and pg_net aren't in PGlite; scheduled jobs and HTTP calls become no-ops.
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
create function cron.unschedule(job_name text) returns boolean language sql as $$
  with d as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from d)
$$;
create schema net;
create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}') returns bigint
  language sql as $$ select 0::bigint $$;
`;

// Extensions PGlite can't load; the stand-ins above take their place.
const UNAVAILABLE_EXTENSIONS = /create extension if not exists (pg_net|pg_cron)[^;]*;/gi;

export type TestUser = { id: string; email: string };

export class TestDb {
  private constructor(readonly pg: PGlite) {}

  static async create() {
    const pg = await PGlite.create({ extensions: { pgcrypto } });
    await pg.exec(SUPABASE_STANDINS);
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      try {
        await pg.exec(
          readFileSync(join(MIGRATIONS, f), "utf8").replace(UNAVAILABLE_EXTENSIONS, ""),
        );
      } catch (e) {
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
    return new TestDb(pg);
  }

  /** Creates a signed-up user (fires the same triggers as Supabase Auth). */
  async user(email: string): Promise<TestUser> {
    const id = randomUUID();
    await this.asAdmin();
    await this.pg.query("insert into auth.users (id, email) values ($1, $2)", [
      id,
      email.toLowerCase(),
    ]);
    return { id, email: email.toLowerCase() };
  }

  /** Acts as the database owner (migrations, setup). */
  async asAdmin() {
    await this.pg.exec(
      "reset role; select set_config('request.jwt.claims', '', false);",
    );
  }

  /** Acts as the server's service-role client. */
  async asService() {
    await this.pg.exec(
      `reset role; select set_config('request.jwt.claims', '{"role":"service_role"}', false); set role service_role;`,
    );
  }

  /** Acts as a signed-in user through the publishable key: RLS applies. */
  async as(user: TestUser) {
    const claims = JSON.stringify({
      sub: user.id,
      email: user.email,
      role: "authenticated",
    });
    await this.pg.exec("reset role;");
    await this.pg.query("select set_config('request.jwt.claims', $1, false)", [
      claims,
    ]);
    await this.pg.exec("set role authenticated;");
  }

  /** Acts as a signed-out visitor. */
  async asAnon() {
    await this.pg.exec(
      `reset role; select set_config('request.jwt.claims', '{"role":"anon"}', false); set role anon;`,
    );
  }

  async rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await this.pg.query<T>(sql, params)).rows;
  }

  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const r = await this.rows<T>(sql, params);
    return r[0];
  }

  /** The value of a single-column, single-row query. */
  async value<T = unknown>(sql: string, params: unknown[] = []) {
    const r = await this.one<Record<string, T>>(sql, params);
    return r ? (Object.values(r)[0] as T) : undefined;
  }

  /** Runs sql and returns the Postgres error message, or null when it succeeded. */
  async error(sql: string, params: unknown[] = []) {
    try {
      await this.pg.query(sql, params);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  async close() {
    await this.pg.close();
  }
}
