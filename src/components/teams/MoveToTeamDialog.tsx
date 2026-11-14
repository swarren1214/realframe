"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupCard } from "@/components/ui/radio-group";
import { moveProject as raw_moveProject } from "@/app/(app)/team/actions";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import { teamLabel, type Team } from "@/lib/team-shared";
import { TeamBadge } from "@/components/teams/TeamSwitcherClient";

const moveProject = unwrapped(raw_moveProject);

export function MoveToTeamDialog({
  open,
  onOpenChange,
  projectId,
  currentTeamId,
  teams,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  currentTeamId: string | null;
  teams: Team[];
}) {
  const router = useRouter();
  const [to, setTo] = useState(currentTeamId ?? "");
  const [busy, setBusy] = useState(false);
  const target = teams.find((t) => t.id === to);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o && setTo(currentTeamId ?? ""), onOpenChange(o))}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to team</DialogTitle>
          <DialogDescription>
            Everyone on the team can open and build on it. You stay its owner.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={to} onValueChange={setTo} className="gap-1.5">
          {teams.map((t) => (
            <RadioGroupCard key={t.id} value={t.id} className="items-center">
              <TeamBadge team={t} />
              <span className="flex-1 text-sm font-medium">{teamLabel(t)}</span>
              {t.id === currentTeamId && (
                <span className="text-xs text-stone-500">Current</span>
              )}
            </RadioGroupCard>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!to || to === currentTeamId}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await moveProject(projectId, to);
                notify.success(
                  `Moved to ${target ? teamLabel(target) : "the team"}`,
                );
                onOpenChange(false);
                router.refresh();
              } catch (e) {
                notify.error(
                  e instanceof Error ? e.message : "Couldn't move it.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <ArrowRightLeft />
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
