import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type ErrorReport = {
  source: "server" | "client";
  message: string;
  digest?: string | null;
  path?: string | null;
  method?: string | null;
  route?: string | null;
  routeType?: string | null;
  userId?: string | null;
  stack?: string | null;
};

const cut = (s: string | null | undefined, n: number) =>
  s == null ? null : String(s).slice(0, n);

/** Saves an error to app_errors. Never throws: reporting must not cause another failure. */
export async function recordError(e: ErrorReport) {
  try {
    const { error } = await createAdminClient()
      .from("app_errors")
      .insert({
        source: e.source,
        message: cut(e.message, 1000) || "(no message)",
        digest: cut(e.digest, 100),
        path: cut(e.path, 500),
        method: cut(e.method, 10),
        route: cut(e.route, 300),
        route_type: cut(e.routeType, 40),
        user_id: e.userId ?? null,
        stack: cut(e.stack, 8000),
      });
    if (error) console.error("recordError", error.message);
  } catch (err) {
    console.error("recordError", err);
  }
}
