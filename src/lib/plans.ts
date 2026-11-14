// Plan facts in one place: the marketing page, billing pages, checkout and tests all read these.
// The database keeps its own copy in public.plan_settings(); tests check the two agree.

export type BillingInterval = "month" | "year";

export const PLANS = {
  free: {
    monthlyBuilds: 30,
  },
  pro: {
    monthlyUsd: 20,
    annualUsd: 200,
    includedUsdPerMonth: 10,
    dailyBuildCap: 150,
  },
  team: {
    monthlyUsdPerBuilder: 20,
    annualUsdPerBuilder: 200,
    includedUsdPerBuilderPerMonth: 10,
  },
  /** Usage past what's included is billed at cost × this. */
  usageMarkup: 1.5,
} as const;

/** What a year on the annual plan saves against twelve monthly payments, in whole percent. */
export function annualSavingsPercent(monthlyUsd: number, annualUsd: number) {
  return Math.round((1 - annualUsd / (monthlyUsd * 12)) * 100);
}

/** "$16.67" — what the annual price works out to per month. */
export function perMonthOf(annualUsd: number) {
  return `$${(annualUsd / 12).toFixed(2)}`;
}

export function readInterval(v: unknown): BillingInterval {
  return v === "year" ? "year" : "month";
}

/** Price label for a plan at an interval, e.g. "$20/month" or "$200/year". */
export function priceLabel(plan: "pro" | "team", interval: BillingInterval) {
  const usd =
    plan === "pro"
      ? interval === "year"
        ? PLANS.pro.annualUsd
        : PLANS.pro.monthlyUsd
      : interval === "year"
        ? PLANS.team.annualUsdPerBuilder
        : PLANS.team.monthlyUsdPerBuilder;
  return `$${usd}/${interval}`;
}
