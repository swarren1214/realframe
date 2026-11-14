"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { respondToInvite as raw_respondToInvite } from "@/app/(app)/team/actions";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import type { TeamInvite } from "@/lib/teams";
import { TeamBadge } from "@/components/teams/TeamSwitcherClient";
import { AnimatePresence, listItem, motion } from "@/components/motion";

const respondToInvite = unwrapped(raw_respondToInvite);

/** Team invites waiting for an answer, each with Accept and Decline. */
export function InviteCards({
  invites,
  compact = false,
}: {
  invites: TeamInvite[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);

  async function respond(inv: TeamInvite, accept: boolean) {
    setBusy(`${inv.team_id}:${accept}`);
    try {
      await respondToInvite(inv.team_id, accept);
      setGone((g) => [...g, inv.team_id]);
      notify.success(
        accept ? `You joined ${inv.team_name}` : `Declined ${inv.team_name}`,
      );
      if (accept) router.push("/projects");
      router.refresh();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const shown = invites.filter((i) => !gone.includes(i.team_id));
  return (
    <ul className={compact ? "space-y-2" : "space-y-3"}>
      <AnimatePresence initial={false}>
        {shown.map((inv) => (
          <motion.li
            key={inv.team_id}
            {...listItem}
            className="flex flex-wrap items-center gap-3 rounded-3xl border border-raspberry-200 bg-glow-soft p-4"
          >
            <TeamBadge
              team={{ name: inv.team_name, personal: false }}
              className="size-10 rounded-xl text-base"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-stone-900">
                {inv.invited_by
                  ? `${inv.invited_by} invited you to ${inv.team_name}`
                  : `You're invited to ${inv.team_name}`}
              </p>
              <p className="text-xs text-stone-600">
                Join as {inv.role === "admin" ? "an admin" : "a member"} to
                share its prototypes, devices and design systems.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                loading={busy === `${inv.team_id}:false`}
                disabled={Boolean(busy)}
                onClick={() => respond(inv, false)}
              >
                <X />
                Decline
              </Button>
              <Button
                loading={busy === `${inv.team_id}:true`}
                disabled={Boolean(busy)}
                onClick={() => respond(inv, true)}
              >
                <Check />
                Accept
              </Button>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
