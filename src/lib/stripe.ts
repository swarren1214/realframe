import "server-only";
import Stripe from "stripe";
import { PLANS, type BillingInterval } from "@/lib/plans";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set on the server.");
  return new Stripe(key, { appInfo: { name: "Realframe" } });
}

// Product and price IDs for each Stripe mode, picked by the secret key in use (sk_live_… or
// sk_test_…). Env vars override them.
const LIVE =
  (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_") ||
  (process.env.STRIPE_SECRET_KEY ?? "").startsWith("rk_live_");
const IDS = LIVE
  ? {
      pro: "price_1UbZfLELy2PWKr0eYb9r7gwz",
      team: "price_1UbZfMELy2PWKr0e60VOBQRu",
      usage: "prod_VcpKAOdeOSQ1wf",
      proAnnual: "price_1UcBxMELy2PWKr0eSVLv4eHk",
      teamAnnual: "price_1UcBxWELy2PWKr0erYHOwOEo",
    }
  : {
      pro: "price_1UbUTj2SmZye3a20wKhLL40Z",
      team: "price_1UbZQB2SmZye3a208JBrKt0f",
      usage: "prod_VcjxgXHZ3lmLdl",
      proAnnual: null,
      teamAnnual: null,
    };

// Realframe Pro, $20/month.
export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || IDS.pro;
// Realframe Team Pro, $20 per member per month.
export const TEAM_PRICE_ID = process.env.STRIPE_TEAM_PRICE_ID || IDS.team;
// Product used for the monthly "AI usage" overage line.
export const USAGE_PRODUCT_ID =
  process.env.STRIPE_USAGE_PRODUCT_ID || IDS.usage;

export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

// Annual prices. When these aren't set, Checkout builds the yearly price inline on the same
// product as the monthly price, so annual billing works before any Stripe setup. Set them
// once real prices exist, so the customer portal can switch between monthly and annual.
export const PRO_ANNUAL_PRICE_ID: string | null =
  process.env.STRIPE_PRO_ANNUAL_PRICE_ID || IDS.proAnnual;
export const TEAM_ANNUAL_PRICE_ID: string | null =
  process.env.STRIPE_TEAM_ANNUAL_PRICE_ID || IDS.teamAnnual;

type LineItem = Stripe.Checkout.SessionCreateParams.LineItem;

/**
 * The Checkout line item for a plan at an interval. `getProduct` looks up the monthly price's
 * product (injected so tests don't call Stripe).
 */
export async function checkoutLineItem(
  plan: "pro" | "team",
  interval: BillingInterval,
  quantity: number,
  getProduct: (priceId: string) => Promise<string>,
): Promise<LineItem> {
  const monthly = plan === "pro" ? PRO_PRICE_ID : TEAM_PRICE_ID;
  if (interval === "month") return { price: monthly, quantity };
  const annual = plan === "pro" ? PRO_ANNUAL_PRICE_ID : TEAM_ANNUAL_PRICE_ID;
  if (annual) return { price: annual, quantity };
  const usd =
    plan === "pro" ? PLANS.pro.annualUsd : PLANS.team.annualUsdPerBuilder;
  return {
    quantity,
    price_data: {
      currency: "usd",
      product: await getProduct(monthly),
      unit_amount: usd * 100,
      recurring: { interval: "year" },
    },
  };
}

/** The product a price belongs to. */
export async function productOf(priceId: string) {
  const price = await getStripe().prices.retrieve(priceId);
  return typeof price.product === "string" ? price.product : price.product.id;
}

/** "month" or "year", from a subscription's first item. */
export function intervalOf(sub: Stripe.Subscription): BillingInterval {
  return sub.items?.data?.[0]?.price?.recurring?.interval === "year"
    ? "year"
    : "month";
}
