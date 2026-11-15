import { redirect } from "next/navigation";
import {
  Check,
  CreditCard,
  PartyPopper,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/Eyebrow";
import { createClient } from "@/lib/supabase/server";
import { formatUsd, type Quota } from "@/lib/billing";
import { PLANS, priceLabel, readInterval } from "@/lib/plans";
import { UpgradeForm } from "@/components/billing/UpgradeForm";
import { BillingTabs, readBillingTab } from "@/components/usage/BillingTabs";
import { Invoices, loadInvoices } from "@/components/usage/Invoices";
import { SpendControls } from "@/components/usage/SpendControls";
import { UsageView, loadUsage } from "@/components/usage/UsageView";

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
  searchParams: Promise<{
    upgraded?: string;
    tab?: string;
    kind?: string;
    project?: string;
    before?: string;
  }>;
}) {
  const params = await searchParams;
  const { upgraded } = params;
  // Fresh from checkout, land on the plan rather than the usage numbers.
  const tab = upgraded ? "billing" : readBillingTab(params.tab);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/billing");

  const [{ data: profile }, { data: quotaRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "plan, subscription_status, cancel_at_period_end, current_period_end, stripe_customer_id, display_name, billing_interval, spend_cap_micros, alert_thresholds",
      )
      .eq("id", user.id)
      .single(),
    supabase.rpc("generation_quota"),
  ]);
  const q = (quotaRows as Quota[] | null)?.[0];
  const usage =
    tab === "usage" ? await loadUsage(supabase, null, params) : null;
  const invoices =
    tab === "billing" ? await loadInvoices(profile?.stripe_customer_id) : [];
  const isPro = profile?.plan === "pro";
  const interval = readInterval(profile?.billing_interval);
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
    <div>
      <main className="mx-auto max-w-5xl space-y-5 px-2 pb-12 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Usage &amp; billing
          </h1>
          <BillingTabs tab={tab} basePath="/billing" />
        </div>

        {usage && <UsageView data={usage} team={null} basePath="/billing" />}

        {tab === "billing" && upgraded && (
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

        {tab === "billing" && (
          <Card>
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex-1">
                <Eyebrow>Current plan</Eyebrow>
                <p className="mt-1 flex items-center gap-2 font-display text-xl font-bold">
                  {isPro ? "Pro" : "Free"}
                  {isPro && (
                    <Badge variant="default">
                      <Sparkles />
                      {priceLabel("pro", interval)}
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-[13px] text-stone-600">
                  {isPro
                    ? profile?.cancel_at_period_end &&
                      profile.current_period_end
                      ? `Cancels on ${fmtDate(profile.current_period_end)}. You keep Pro until then.`
                      : profile?.current_period_end
                        ? `Renews ${fmtDate(profile.current_period_end)}`
                        : "Active"
                    : `${PLANS.free.monthlyBuilds} builds a month, free.`}
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
                      label={
                        interval === "year"
                          ? "AI usage this month"
                          : "AI usage this period"
                      }
                      value={`${formatUsd(Number(q.usage_micros))} of ${formatUsd(Number(q.included_micros), 0)} included`}
                      pct={includedPct}
                    />
                    <p className="text-xs text-stone-500">
                      {overage > 0
                        ? `${formatUsd(overage)} beyond your included usage so far, added to your next invoice.`
                        : interval === "year"
                          ? "Your included usage resets every month. Usage beyond it is billed at cost plus 50% when the month ends."
                          : "Usage beyond what's included is billed at cost plus 50% on your next invoice."}{" "}
                      Failed builds are never billed.{" "}
                      {interval === "year" ? "This month" : "Period"}{" "}
                      {fmtDate(q.period_start)} – {fmtDate(q.period_end)}.
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
        )}

        {tab === "billing" && isPro && (
          <Card id="spend-controls">
            <Eyebrow>Alerts and spend cap</Eyebrow>
            <SpendControls
              teamId={null}
              capMicros={
                profile?.spend_cap_micros == null
                  ? null
                  : Number(profile.spend_cap_micros)
              }
              thresholds={
                (profile?.alert_thresholds as number[] | null) ?? [50, 80, 100]
              }
              includedMicros={Number(q?.included_micros ?? 10_000_000)}
              canEdit
            />
          </Card>
        )}

        {tab === "billing" && profile?.stripe_customer_id && (
          <Invoices invoices={invoices} />
        )}

        {tab === "billing" && !isPro && (
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
                  Realframe Pro
                </p>
                <ul className="mt-3 space-y-1.5 text-[13px] text-white/90">
                  {[
                    "No monthly build cap",
                    "Canvas: every screen and device side by side",
                    `$${PLANS.pro.includedUsdPerMonth} of AI usage included every month`,
                    "Pay as you go beyond that, at cost plus 50%",
                    "Failed builds are never billed",
                    "Reviewers are always free",
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
              <UpgradeForm
                action="/api/billing/checkout"
                monthlyUsd={PLANS.pro.monthlyUsd}
                annualUsd={PLANS.pro.annualUsd}
                tone="dark"
                button={() => (
                  <Button
                    size="lg"
                    type="submit"
                    className="border-0 bg-card text-raspberry-800 hover:bg-card/90"
                  >
                    Upgrade to Pro
                  </Button>
                )}
              />
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
