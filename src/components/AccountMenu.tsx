import { createClient } from "@/lib/supabase/server";
import type { Quota } from "@/lib/billing";
import { AccountMenuClient } from "@/components/AccountMenuClient";

/**
 * The profile menu in the top bar. A server component: it loads the signed-in user's
 * profile and plan usage itself, so any page (or client component, via a prop) can drop it in.
 */
export async function AccountMenu({ compact = false }: { compact?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: quotaRows }] = await Promise.all([
    supabase.from("profiles").select("display_name, plan").eq("id", user.id).maybeSingle(),
    supabase.rpc("generation_quota"),
  ]);
  const q = (quotaRows as Quota[] | null)?.[0];

  return (
    <AccountMenuClient
      compact={compact}
      name={profile?.display_name ?? null}
      email={user.email ?? ""}
      plan={profile?.plan === "pro" ? "pro" : "free"}
      usage={
        q
          ? {
              used: q.used,
              limit: q.build_limit,
              usageMicros: Number(q.usage_micros),
              includedMicros: Number(q.included_micros),
              periodEnd: q.period_end,
            }
          : null
      }
    />
  );
}
