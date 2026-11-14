import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { UserError } from "@/lib/services/projects";

// Helpers for the native apps' API (/api/v1, served at api.realframe.app/v1).
// Every call carries `Authorization: Bearer <Supabase access token>`. Cookies are never read,
// so there is no CSRF surface. Requests run as the signed-in user, so RLS and
// project_role() decide access exactly as they do for the web app.

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export type Authed = { supabase: SupabaseClient; user: User; token: string };

/** A Supabase client acting as the caller, from the request's bearer token. */
export async function authenticate(request: NextRequest): Promise<Authed> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new ApiError(401, "Sign in first.", "unauthenticated");
  const token = match[1].trim();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError(
      401,
      "Your session has expired. Sign in again.",
      "unauthenticated",
    );
  return { supabase, user: data.user, token };
}

/** The caller's role on a project, or a 404 when they have none. */
export async function requireRole(
  supabase: SupabaseClient,
  projectId: string,
  allowed: string[],
) {
  const { data: role } = await supabase.rpc("project_role", { p: projectId });
  if (!role) throw new ApiError(404, "Project not found.", "not_found");
  if (!allowed.includes(role as string))
    throw new ApiError(403, "You don't have access to do that.", "forbidden");
  return role as string;
}

export async function readJson<T>(request: NextRequest): Promise<Partial<T>> {
  return ((await request.json().catch(() => ({}))) ?? {}) as Partial<T>;
}

/** Wraps a handler: authenticates, and turns thrown errors into JSON responses. */
export function route<P>(
  handler: (request: NextRequest, auth: Authed, params: P) => Promise<Response>,
) {
  return async (request: NextRequest, context: { params: Promise<P> }) => {
    try {
      const auth = await authenticate(request);
      return await handler(request, auth, await context.params);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.status },
        );
      }
      if (err instanceof UserError)
        return NextResponse.json(
          { error: err.message, code: "invalid" },
          { status: 400 },
        );
      console.error("api/v1", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong.";
      return NextResponse.json(
        { error: message, code: "server_error" },
        { status: 500 },
      );
    }
  };
}

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });
