import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

// POST (form submit with team_id) → the Stripe portal for the team's subscription. Admins only.
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const teamId = String((await request.formData()).get("team_id") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/?next=/team", origin), 303);
  const { data: role } = await supabase.rpc("team_role", { t: teamId });
  if (role !== "admin")
    return NextResponse.redirect(new URL("/team/billing", origin), 303);
  const { data: team } = await createAdminClient()
    .from("teams")
    .select("stripe_customer_id")
    .eq("id", teamId)
    .single();
  if (!team?.stripe_customer_id)
    return NextResponse.redirect(new URL("/team/billing", origin), 303);
  const session = await getStripe().billingPortal.sessions.create({
    customer: team.stripe_customer_id,
    return_url: `${origin}/team/billing`,
  });
  return NextResponse.redirect(session.url, 303);
}
