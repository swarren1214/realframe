import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRO_PRICE_ID, getStripe } from "@/lib/stripe";

// POST (form submit) → redirect to Stripe Checkout for Realframe Pro.
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/?next=/billing", origin), 303);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("plan, stripe_customer_id, display_name")
    .eq("id", user.id)
    .single();
  if (profile?.plan === "pro") return NextResponse.redirect(new URL("/billing", origin), 303);

  const stripe = getStripe();
  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: user.email,
        name: profile?.display_name ?? undefined,
        metadata: { supabase_user_id: user.id, app: "realframe" },
      },
      { idempotencyKey: `customer-${user.id}` },
    );
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: { metadata: { supabase_user_id: user.id, app: "realframe" } },
    success_url: `${origin}/billing?upgraded=1`,
    cancel_url: `${origin}/billing`,
  });
  return NextResponse.redirect(session.url!, 303);
}
