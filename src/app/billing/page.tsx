import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/server";
import { formatUsd, type Quota } from "@/lib/billing";

export const dynamic = "force-dynamic";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const { upgraded } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?next=/billing");

  const [{ data: profile }, { data: quotaRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, subscription_status, cancel_at_period_end, current_period_end, stripe_customer_id")
      .eq("id", user.id)
      .single(),
    supabase.rpc("generation_quota"),
  ]);
  const q = (quotaRows as Quota[] | null)?.[0];
  const isPro = profile?.plan === "pro";
  const overage = q ? Math.max(Number(q.usage_micros) - Number(q.included_micros), 0) : 0;
  const includedPct = q && q.included_micros > 0 ? Math.min(100, (Number(q.usage_micros) / Number(q.included_micros)) * 100) : 0;
  const buildPct = q ? Math.min(100, (q.used / Math.max(q.build_limit, 1)) * 100) : 0;

  return (
    <div className="min-h-screen px-4">
      <header className="glass mx-auto mt-4 flex max-w-5xl items-center gap-4 rounded-full px-5 py-2.5">
        <Logo href="/projects" />
        <div className="flex-1" />
        <a href="/projects" className="text-sm font-medium text-stone-700">
          Prototypes
        </a>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <h1 className="font-display text-3xl font-bold">Plan &amp; billing</h1>

        {upgraded && (
          <p role="status" className="rounded-3xl bg-emerald-50 p-4 text-sm text-emerald-900">
            {isPro
              ? "You're on Pro. Thanks for upgrading!"
              : "Payment received. Your plan will switch to Pro in a few seconds. Refresh if it hasn't yet."}
          </p>
        )}

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">Current plan</p>
              <p className="mt-1 font-display text-2xl font-bold">{isPro ? "Pro" : "Free"}</p>
              <p className="mt-1 text-sm text-stone-600">
                {isPro
                  ? profile?.cancel_at_period_end && profile.current_period_end
                    ? `Cancels on ${fmtDate(profile.current_period_end)}. You keep Pro until then.`
                    : profile?.current_period_end
                      ? `$20/month · renews ${fmtDate(profile.current_period_end)}`
                      : "$20/month"
                  : "30 builds a month, free."}
                {isPro && profile?.subscription_status === "past_due" && " Your last payment failed. Update your card to keep Pro."}
              </p>
            </div>
            {isPro || profile?.stripe_customer_id ? (
              <form action="/api/billing/portal" method="post">
                <button className="min-h-11 rounded-full border border-stone-200 px-4 text-sm font-semibold hover:bg-stone-50">
                  Manage billing
                </button>
              </form>
            ) : null}
          </div>

          {q && (
            <div className="mt-6 space-y-5 border-t border-stone-100 pt-6">
              {isPro ? (
                <>
                  <Meter
                    label="AI usage this period"
                    value={`${formatUsd(Number(q.usage_micros))} of ${formatUsd(Number(q.included_micros), 0)} included`}
                    pct={includedPct}
                  />
                  <p className="text-sm text-stone-600">
                    {overage > 0
                      ? `${formatUsd(overage)} beyond your included usage so far. It's added to your next invoice.`
                      : "Usage beyond what's included is billed at cost plus 50% on your next invoice."}{" "}
                    Period: {fmtDate(q.period_start)} – {fmtDate(q.period_end)}.
                  </p>
                </>
              ) : (
                <>
                  <Meter label="Builds this month" value={`${q.used} of ${q.build_limit}`} pct={buildPct} />
                  <p className="text-sm text-stone-600">Your free builds reset on {fmtDate(q.period_end)}.</p>
                </>
              )}
            </div>
          )}
        </section>

        {!isPro && (
          <section className="rounded-[2rem] border-2 border-ember-700 bg-white p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1">
                <p className="font-display text-xl font-bold">Realframe Pro · $20/month</p>
                <ul className="mt-2 space-y-1 text-sm text-stone-700">
                  <li>· Build as much as you need, with no monthly build cap</li>
                  <li>· $10 of AI usage included every month</li>
                  <li>· Beyond that, pay as you go at cost plus 50%, billed monthly</li>
                </ul>
              </div>
              <form action="/api/billing/checkout" method="post">
                <button className="min-h-12 rounded-full btn-glow px-6 font-semibold">
                  Upgrade to Pro
                </button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-stone-600">{value}</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-stone-100"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full btn-glow" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
