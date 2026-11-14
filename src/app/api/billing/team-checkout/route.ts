import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEAM_PRICE_ID, getStripe } from "@/lib/stripe";
import { activeSeats } from "@/lib/team-billing";

// POST (form submit with team_id) → Stripe Checkout for Team Pro, one seat per active member.
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const teamId = String(form.get("team_id") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/?next=/team", origin), 303);
  const { data: role } = await supabase.rpc("team_role", { t: teamId });
  if (role !== "admin")
    return NextResponse.redirect(
      new URL("/team?toast=Only%20admins%20can%20manage%20billing", origin),
      303,
    );

  const admin = createAdminClient();
  const { data: team } = await admin
    .from("teams")
    .select("name, personal, plan, stripe_customer_id")
    .eq("id", teamId)
    .single();
  if (!team || team.personal)
    return NextResponse.redirect(new URL("/team", origin), 303);
  if (team.plan === "team")
    return NextResponse.redirect(new URL("/team", origin), 303);

  const stripe = getStripe();
  let customerId = team.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: user.email,
        name: team.name,
        metadata: { realframe_team_id: teamId, app: "realframe" },
      },
      { idempotencyKey: `team-customer-${teamId}` },
    );
    customerId = customer.id;
    await admin
      .from("teams")
      .update({ stripe_customer_id: customerId })
      .eq("id", teamId);
  }

  const seats = await activeSeats(teamId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: teamId,
    line_items: [{ price: TEAM_PRICE_ID, quantity: seats }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { realframe_team_id: teamId, app: "realframe" },
    },
    metadata: { realframe_team_id: teamId },
    success_url: `${origin}/team?toast=${encodeURIComponent("Team Pro is on")}`,
    cancel_url: `${origin}/team`,
  });
  return NextResponse.redirect(session.url!, 303);
}
