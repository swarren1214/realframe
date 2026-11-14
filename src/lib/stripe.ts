import "server-only";
import Stripe from "stripe";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set on the server.");
  return new Stripe(key, { appInfo: { name: "Realframe" } });
}

// Product and price IDs for each Stripe mode, picked by the secret key in use (sk_live_… or
// sk_test_…). Env vars override them.
const LIVE = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_") || (process.env.STRIPE_SECRET_KEY ?? "").startsWith("rk_live_");
const IDS = LIVE
  ? { pro: "price_1UbZfLELy2PWKr0eYb9r7gwz", team: "price_1UbZfMELy2PWKr0e60VOBQRu", usage: "prod_VcpKAOdeOSQ1wf" }
  : { pro: "price_1UbUTj2SmZye3a20wKhLL40Z", team: "price_1UbZQB2SmZye3a208JBrKt0f", usage: "prod_VcjxgXHZ3lmLdl" };

// Realframe Pro, $20/month.
export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || IDS.pro;
// Realframe Team Pro, $20 per member per month.
export const TEAM_PRICE_ID = process.env.STRIPE_TEAM_PRICE_ID || IDS.team;
// Product used for the monthly "AI usage" overage line.
export const USAGE_PRODUCT_ID = process.env.STRIPE_USAGE_PRODUCT_ID || IDS.usage;

export const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
