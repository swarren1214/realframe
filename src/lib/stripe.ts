import "server-only";
import Stripe from "stripe";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set on the server.");
  return new Stripe(key, { appInfo: { name: "Realframe" } });
}

// Realframe Pro, $20/month (sandbox). Override per environment when going live.
export const PRO_PRICE_ID =
  process.env.STRIPE_PRO_PRICE_ID || "price_1UbUTj2SmZye3a20wKhLL40Z";
// Realframe Team Pro, $20 per member per month (sandbox).
export const TEAM_PRICE_ID =
  process.env.STRIPE_TEAM_PRICE_ID || "price_1UbZQB2SmZye3a208JBrKt0f";
// Product used for the monthly "AI usage" overage line.
export const USAGE_PRODUCT_ID =
  process.env.STRIPE_USAGE_PRODUCT_ID || "prod_VcjxgXHZ3lmLdl";

export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
