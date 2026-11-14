"use client";
import { createBrowserClient } from "@supabase/ssr";
import { cookieDomain } from "@/lib/hosts";

export function createClient() {
  const domain = typeof window === "undefined" ? undefined : cookieDomain(window.location.host);
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: domain ? { domain } : undefined,
  });
}
