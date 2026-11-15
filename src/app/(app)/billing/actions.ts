"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { action } from "@/lib/safe-action";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALERT_ALLOWED, parseCapUsd } from "@/lib/usage";

/**
 * Saves the spend cap and usage alert thresholds: your own (teamId null), or a Team Pro
 * team's, which only its admins can change.
 */
export const saveSpendControls = action(
  async (teamId: string | null, capUsd: string, thresholds: number[]) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const cap = parseCapUsd(capUsd);
    if (cap === "invalid")
      throw new Error("Enter the cap in dollars, like 25 or 25.50.");
    const picked = [...new Set(thresholds.map(Number))]
      .filter((t) => ALERT_ALLOWED.includes(t))
      .sort((a, b) => a - b);
    const values = { spend_cap_micros: cap, alert_thresholds: picked };

    if (!teamId) {
      const { error } = await supabase
        .from("profiles")
        .update(values)
        .eq("id", user.id);
      if (error) throw new Error(error.message);
      revalidatePath("/billing");
      return;
    }

    const { data: role } = await supabase.rpc("team_role", { t: teamId });
    if (role !== "admin")
      throw new Error("Only workspace admins can change spend controls.");
    const { error } = await createAdminClient()
      .from("teams")
      .update(values)
      .eq("id", teamId);
    if (error) throw new Error(error.message);
    revalidatePath("/team/billing");
  },
);
