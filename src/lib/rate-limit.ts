import "server-only";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** The caller's IP as Vercel reports it, or "unknown". */
export function clientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Counts a hit and says whether it's allowed (at most `limit` per `windowSeconds`). If the
 * limiter itself can't be reached, it allows the request rather than locking people out.
 */
export async function allow(key: string, limit: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("hit_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("hit_rate_limit", error.message);
    return true;
  }
  return data !== false;
}
