"use client";
import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLANS,
  annualSavingsPercent,
  perMonthOf,
  type BillingInterval,
} from "@/lib/plans";

type Plan = {
  name: string;
  tagline: string;
  price: (i: BillingInterval) => string;
  unit: (i: BillingInterval) => string;
  note: (i: BillingInterval) => string;
  cta: string;
  href: string;
  popular?: boolean;
  items: string[];
};

const included = `$${PLANS.pro.includedUsdPerMonth}`;

const PLAN_LIST: Plan[] = [
  {
    name: "Free",
    tagline: "For trying ideas and small reviews.",
    price: () => "$0",
    unit: () => "",
    note: () => "Forever",
    cta: "Start free",
    href: "/login",
    items: [
      `${PLANS.free.monthlyBuilds} builds a month`,
      "Unlimited reviewers, free",
      "Invite-only review links",
      "Pinned comments and version history",
      "GitHub and file import",
    ],
  },
  {
    name: "Pro",
    tagline: "For product people prototyping every week.",
    price: (i) => `$${i === "year" ? PLANS.pro.annualUsd : PLANS.pro.monthlyUsd}`,
    unit: (i) => (i === "year" ? "/ year" : "/ month"),
    note: (i) =>
      i === "year"
        ? `Works out to ${perMonthOf(PLANS.pro.annualUsd)} a month`
        : `Or $${PLANS.pro.annualUsd} a year, billed annually`,
    cta: "Get Pro",
    href: "/login?next=/billing",
    popular: true,
    items: [
      `${included} of AI usage included every month`,
      "Then cost + 50%; failed builds are free",
      "Review rounds and fix from feedback",
      "Canvas, variants and visual edits",
      "Password links for clients",
      "Unlimited reviewers, free",
    ],
  },
  {
    name: "Team",
    tagline: "For product, design and engineering together.",
    price: (i) =>
      `$${i === "year" ? PLANS.team.annualUsdPerBuilder : PLANS.team.monthlyUsdPerBuilder}`,
    unit: (i) => (i === "year" ? "/ builder / year" : "/ builder / month"),
    note: () => "Reviewers are free and unlimited",
    cta: "Start a team",
    href: "/login?next=/team/billing",
    items: [
      "Everything in Pro",
      "Shared team workspace",
      `${included} of AI usage per builder each month, pooled`,
      "Free reviewer seats for your whole company",
      "Team devices and design systems",
      "One invoice",
    ],
  },
];

export function Pricing({ heading = "h2" }: { heading?: "h1" | "h2" }) {
  const [interval, setPeriod] = useState<BillingInterval>("year");
  const H = heading;
  const PlanHeading = heading === "h1" ? "h2" : "h3";
  const save = annualSavingsPercent(PLANS.pro.monthlyUsd, PLANS.pro.annualUsd);
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20"
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-[13px] font-bold uppercase tracking-[.08em] text-raspberry-700">
            Pricing
          </p>
          <H
            id="pricing-heading"
            className="mt-2 font-display text-4xl font-bold tracking-tight"
          >
            Pay for builders. Reviewers are free.
          </H>
          <p className="mt-2 text-stone-600">
            AI usage past what&apos;s included is billed at cost + 50%. Failed
            builds are never billed.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Billing period"
          className="inline-flex rounded-full border border-stone-200 bg-stone-100 p-1"
        >
          {(["month", "year"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={interval === v}
              onClick={() => setPeriod(v)}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors",
                interval === v
                  ? "bg-card text-stone-900 shadow-sm"
                  : "text-stone-600 hover:text-stone-900",
              )}
            >
              {v === "month" ? "Monthly" : `Annual · 2 months free`}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_LIST.map((p) => (
          <article
            key={p.name}
            data-plan={p.name.toLowerCase()}
            className={cn(
              "flex flex-col rounded-[1.75rem] bg-card p-7",
              p.popular
                ? "border-2 border-raspberry-700 shadow-[0_20px_40px_-20px_rgba(190,24,93,.35)]"
                : "border border-stone-200",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <PlanHeading className="font-display text-xl font-bold">{p.name}</PlanHeading>
              {p.popular && (
                <span className="rounded-full bg-raspberry-50 px-2.5 py-1 text-xs font-bold text-raspberry-800">
                  Most popular
                </span>
              )}
            </div>
            <p className="mt-2 min-h-10 text-sm text-stone-500">{p.tagline}</p>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span
                className="font-display text-[44px] font-bold leading-none"
                data-testid={`price-${p.name.toLowerCase()}`}
              >
                {p.price(interval)}
              </span>
              <span className="text-sm text-stone-500">{p.unit(interval)}</span>
            </p>
            <p className="mt-1.5 min-h-5 text-[13px] text-stone-500">
              {p.note(interval)}
            </p>
            <Link
              href={p.href}
              className={cn(
                "mt-5 rounded-full px-5 py-3 text-center text-[15px] font-semibold transition-colors",
                p.popular
                  ? "btn-glow text-white"
                  : "bg-stone-100 text-stone-900 hover:bg-stone-200",
              )}
            >
              {p.cta}
            </Link>
            <ul className="mt-6 space-y-2.5">
              {p.items.map((i) => (
                <li
                  key={i}
                  className="flex gap-2.5 text-sm leading-snug text-stone-700"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-raspberry-700"
                    aria-hidden="true"
                  />
                  {i}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-stone-500">
        Prices in US dollars. Annual plans save {save}% and still include AI
        usage every month.
      </p>
    </section>
  );
}
