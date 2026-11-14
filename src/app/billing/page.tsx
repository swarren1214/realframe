import { redirect } from "next/navigation";
import {
  Check,
  CreditCard,
  PartyPopper,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/Eyebrow";
import { createClient } from "@/lib/supabase/server";
import { formatUsd, type Quota } from "@/lib/billing";

export const dynamic = "force-dynamic";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string }>;
}) {
  const { upgraded } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?next=/billing");

  const [{ data: profile }, { data: quotaRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "plan, subscription_status, cancel_at_period_end, current_period_end, stripe_customer_id, display_name",
      )
      .eq("id", user.id)
      .single(),
    supabase.rpc("generation_quota"),
  ]);
  const q = (quotaRows as Quota[] | null)?.[0];
  const isPro = profile?.plan === "pro";
  const overage = q
    ? Math.max(Number(q.usage_micros) - Number(q.included_micros), 0)
    : 0;
  const includedPct =
    q && q.included_micros > 0
      ? Math.min(
          100,
          (Number(q.usage_micros) / Number(q.included_micros)) * 100,
        )
      : 0;
  const buildPct = q
    ? Math.min(100, (q.used / Math.max(q.build_limit, 1)) * 100)
    : 0;

  return (
    <div className="min-h-screen px-4 pb-16">
      <AppHeader plan={profile?.plan} />
      <main className="mx-auto max-w-3xl space-y-5 px-2 pt-10">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Plan &amp; billing
        </h1>

        {upgraded && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900"
          >
            <PartyPopper className="size-4 shrink-0" aria-hidden="true" />
            {isPro
              ? "You're on Pro. Thanks for upgrading!"
              : "Payment received. Your plan switches to Pro in a few seconds. Refresh if it hasn't yet."}
          </p>
        )}

        <Card>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1">
              <Eyebrow>Current plan</Eyebrow>
              <p className="mt-1 flex items-center gap-2 font-display text-xl font-bold">
                {isPro ? "Pro" : "Free"}
                {isPro && (
                  <Badge variant="default">
                    <Sparkles />
                    $20/month
                  </Badge>
                )}
              </p>
              <p className="mt-1 text-[13px] text-stone-600">
                {isPro
                  ? profile?.cancel_at_period_end && profile.current_period_end
                    ? `Cancels on ${fmtDate(profile.current_period_end)}. You keep Pro until then.`
                    : profile?.current_period_end
                      ? `Renews ${fmtDate(profile.current_period_end)}`
                      : "Active"
                  : "30 builds a month, free."}
              </p>
              {isPro && profile?.subscription_status === "past_due" && (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-amber-800">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  Your last payment failed. Update your card to keep Pro.
                </p>
              )}
            </div>
            {isPro || profile?.stripe_customer_id ? (
              <form action="/api/billing/portal" method="post">
                <Button type="submit">
                  <CreditCard />
                  Manage billing
                </Button>
              </form>
            ) : null}
          </div>

          {q && (
            <div className="mt-5 space-y-3 border-t border-stone-100 pt-5">
              {isPro ? (
                <>
                  <Meter
                    label="AI usage this period"
                    value={`${formatUsd(Number(q.usage_micros))} of ${formatUsd(Number(q.included_micros), 0)} included`}
                    pct={includedPct}
                  />
                  <p className="text-xs text-stone-500">
                    {overage > 0
                      ? `${formatUsd(overage)} beyond your included usage so far, added to your next invoice.`
                      : "Usage beyond what's included is billed at cost plus 50% on your next invoice."}{" "}
                    Period {fmtDate(q.period_start)} – {fmtDate(q.period_end)}.
                  </p>
                </>
              ) : (
                <>
                  <Meter
                    label="Builds this month"
                    value={`${q.used} of ${q.build_limit}`}
                    pct={buildPct}
                  />
                  <p className="text-xs text-stone-500">
                    Free builds reset on {fmtDate(q.period_end)}.
                  </p>
                </>
              )}
            </div>
          )}
        </Card>

        {!isPro && (
          <section className="rf-light-palette relative overflow-hidden rounded-3xl bg-gradient-to-br from-ember-700 via-raspberry-700 to-violet-700 p-6 text-white shadow-[0_24px_48px_-24px_rgba(190,24,93,.6)]">
            <svg
              aria-hidden="true"
              viewBox="0 0 200 200"
              className="absolute -right-10 -top-12 size-56 opacity-30"
            >
              <circle
                cx="100"
                cy="100"
                r="80"
                fill="none"
                stroke="#fff"
                strokeDasharray="3 8"
              />
              <circle cx="100" cy="100" r="50" fill="#fff" fillOpacity=".15" />
            </svg>
            <div className="relative flex flex-wrap items-end gap-5">
              <div className="flex-1">
                <p className="flex items-center gap-2 font-display text-lg font-bold">
                  <Sparkles className="size-4" aria-hidden="true" />
                  Realframe Pro · $20/month
                </p>
                <ul className="mt-3 space-y-1.5 text-[13px] text-white/90">
                  {[
                    "No monthly build cap",
                    "Canvas: every screen and device side by side",
                    "$10 of AI usage included every month",
                    "Pay as you go beyond that, at cost plus 50%",
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <form action="/api/billing/checkout" method="post">
                <Button
                  size="lg"
                  type="submit"
                  className="border-0 bg-card text-raspberry-800 hover:bg-card/90"
                >
                  Upgrade to Pro
                </Button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Meter({
  label,
  value,
  pct,
}: {
  label: string;
  value: string;
  pct: number;
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="font-medium">{label}</span>
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
        <div
          className="h-full rounded-full btn-glow"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
