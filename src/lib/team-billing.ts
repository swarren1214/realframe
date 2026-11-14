import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

/** Active members are the seats Team Pro charges for. */
export async function activeSeats(teamId: string) {
  const { count } = await createAdminClient()
    .from("team_members")
    .select("email", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("status", "active");
  return Math.max(1, count ?? 1);
}

/**
 * Keeps a Team Pro subscription's quantity equal to the team's active members. Called whenever
 * someone joins or leaves. Prorated, so adding someone mid-month charges for the rest of it.
 */
export async function syncSeats(teamId: string) {
  const admin = createAdminClient();
  const { data: team } = await admin
    .from("teams")
    .select("plan, stripe_subscription_id, seats")
    .eq("id", teamId)
    .maybeSingle();
  const seats = await activeSeats(teamId);
  if (!team?.stripe_subscription_id || team.plan !== "team") {
    if (team && team.seats !== seats)
      await admin.from("teams").update({ seats }).eq("id", teamId);
    return;
  }
  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(
      team.stripe_subscription_id,
    );
    const item = sub.items.data[0];
    if (item && item.quantity !== seats) {
      await stripe.subscriptionItems.update(item.id, {
        quantity: seats,
        proration_behavior: "create_prorations",
      });
    }
    await admin.from("teams").update({ seats }).eq("id", teamId);
  } catch (e) {
    console.error("seat sync failed", teamId, e);
  }
}
