import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_STATUSES, USAGE_PRODUCT_ID, getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

// Keep profiles in sync with the customer's subscription.
async function syncSubscription(sub: Stripe.Subscription, userIdHint?: string | null) {
  const admin = createAdminClient();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  // Billing periods live on subscription items in current API versions.
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number }) | undefined;
  const legacy = sub as unknown as { current_period_start?: number; current_period_end?: number };
  const active = ACTIVE_STATUSES.has(sub.status);
  const fields = {
    plan: active ? "pro" : "free",
    stripe_customer_id: customerId,
    stripe_subscription_id: active ? sub.id : null,
    subscription_status: sub.status,
    current_period_start: active ? iso(item?.current_period_start ?? legacy.current_period_start) : null,
    current_period_end: active ? iso(item?.current_period_end ?? legacy.current_period_end) : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
  };

  const userId = userIdHint || (sub.metadata?.supabase_user_id as string | undefined) || null;
  const query = admin.from("profiles").update(fields);
  const { error } = userId ? await query.eq("id", userId) : await query.eq("stripe_customer_id", customerId);
  if (error) throw new Error(`profile update failed: ${error.message}`);
}

// On each renewal invoice, add one line for AI usage beyond what Pro includes
// during the period that just ended.
async function addUsageOverage(invoice: Stripe.Invoice) {
  if (invoice.billing_reason !== "subscription_cycle" || invoice.status !== "draft") return;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  if (!profile) return;
  const { data: settings } = await admin.rpc("plan_settings");
  const included = Number((settings as { pro_included_micros: number }[] | null)?.[0]?.pro_included_micros ?? 10_000_000);

  const from = iso(invoice.period_start)!;
  const to = iso(invoice.period_end)!;
  const { data: rows, error } = await admin
    .from("generations")
    .select("id, billed_micros")
    .eq("user_id", profile.id)
    .gte("created_at", from)
    .lt("created_at", to)
    .is("billed_invoice_id", null);
  if (error) throw new Error(error.message);

  const total = (rows ?? []).reduce((sum, r) => sum + Number(r.billed_micros ?? 0), 0);
  const overageMicros = total - included;
  if (overageMicros > 0) {
    const cents = Math.ceil(overageMicros / 10_000);
    const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    await getStripe().invoiceItems.create(
      {
        customer: customerId,
        invoice: invoice.id,
        currency: invoice.currency || "usd",
        amount: cents,
        description: `AI usage beyond $${(included / 1_000_000).toFixed(0)} included (${fmt(from)} – ${fmt(to)})`,
        metadata: { app: "realframe", kind: "usage_overage", product: USAGE_PRODUCT_ID, builds: String(rows?.length ?? 0) },
      },
      { idempotencyKey: `overage-${invoice.id}` },
    );
  }
  if (rows?.length) {
    await admin
      .from("generations")
      .update({ billed_invoice_id: invoice.id })
      .in(
        "id",
        rows.map((r) => r.id),
      );
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "Not configured" }, { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe.subscriptions.retrieve(subId), session.client_reference_id);
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
