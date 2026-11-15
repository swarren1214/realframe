import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { billUsageWindow } from "@/lib/usage-billing";
import {
  ACTIVE_STATUSES,
  USAGE_PRODUCT_ID,
  getStripe,
  intervalOf,
} from "@/lib/stripe";

export const runtime = "nodejs";

const iso = (s: number | null | undefined) =>
  s ? new Date(s * 1000).toISOString() : null;

// Team Pro subscriptions carry the team's id; keep the team row in sync with them.
async function syncTeamSubscription(sub: Stripe.Subscription, teamId: string) {
  const admin = createAdminClient();
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;
  const active = ACTIVE_STATUSES.has(sub.status);
  const { error } = await admin
    .from("teams")
    .update({
      plan: active ? "team" : "free",
      stripe_customer_id: customerId,
      stripe_subscription_id: active ? sub.id : null,
      subscription_status: sub.status,
      seats: item?.quantity ?? 1,
      billing_interval: intervalOf(sub),
      current_period_start: active ? iso(item?.current_period_start) : null,
      current_period_end: active ? iso(item?.current_period_end) : null,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    })
    .eq("id", teamId);
  if (error) throw new Error(`team update failed: ${error.message}`);
}

// Keep profiles in sync with the customer's subscription.
async function syncSubscription(
  sub: Stripe.Subscription,
  userIdHint?: string | null,
) {
  const teamId = sub.metadata?.realframe_team_id as string | undefined;
  if (teamId) return syncTeamSubscription(sub, teamId);
  const admin = createAdminClient();
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  // Billing periods live on subscription items in current API versions.
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;
  const legacy = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const active = ACTIVE_STATUSES.has(sub.status);
  const fields = {
    plan: active ? "pro" : "free",
    stripe_customer_id: customerId,
    stripe_subscription_id: active ? sub.id : null,
    subscription_status: sub.status,
    billing_interval: intervalOf(sub),
    current_period_start: active
      ? iso(item?.current_period_start ?? legacy.current_period_start)
      : null,
    current_period_end: active
      ? iso(item?.current_period_end ?? legacy.current_period_end)
      : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
  };

  const userId =
    userIdHint ||
    (sub.metadata?.supabase_user_id as string | undefined) ||
    null;
  const query = admin.from("profiles").update(fields);
  const { error } = userId
    ? await query.eq("id", userId)
    : await query.eq("stripe_customer_id", customerId);
  if (error) throw new Error(`profile update failed: ${error.message}`);
}

// On each renewal invoice, add one line for AI usage beyond what Pro includes
// during the period that just ended.
async function addUsageOverage(invoice: Stripe.Invoice) {
  if (
    invoice.billing_reason !== "subscription_cycle" ||
    invoice.status !== "draft"
  )
    return;
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  if (!customerId) return;

  const admin = createAdminClient();
  const [{ data: profile }, { data: team }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, billing_interval")
      .eq("stripe_customer_id", customerId)
      .maybeSingle(),
    admin
      .from("teams")
      .select("id, seats, billing_interval")
      .eq("stripe_customer_id", customerId)
      .maybeSingle(),
  ]);
  if (!profile && !team) return;
  // Annual plans are billed for usage every month by /api/cron/bill-usage instead.
  if ((team ?? profile)?.billing_interval === "year") return;
  const { data: settings } = await admin.rpc("plan_settings");
  const perSeat = Number(
    (settings as { pro_included_micros: number }[] | null)?.[0]
      ?.pro_included_micros ?? 10_000_000,
  );
  // A team's included usage is pooled: one Pro allowance per seat.
  const included = team
    ? perSeat * Math.max(1, Number(team.seats ?? 1))
    : perSeat;

  // The renewal invoice covers the period that just ended; bill that window once.
  await billUsageWindow(
    admin,
    getStripe(),
    team
      ? { kind: "team", id: team.id, customerId }
      : { kind: "user", id: profile!.id, customerId },
    {
      start: new Date(invoice.period_start * 1000),
      end: new Date(invoice.period_end * 1000),
    },
    included,
    { id: invoice.id!, currency: invoice.currency },
  );
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature)
    return NextResponse.json({ error: "Not configured" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      secret,
    );
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          if (session.metadata?.realframe_team_id)
            await syncTeamSubscription(sub, session.metadata.realframe_team_id);
          else await syncSubscription(sub, session.client_reference_id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case "invoice.created":
        await addUsageOverage(event.data.object as Stripe.Invoice);
        break;
    }
  } catch (err) {
    console.error("stripe webhook", event.type, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
