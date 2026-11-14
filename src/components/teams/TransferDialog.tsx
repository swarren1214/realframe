"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRoundCheck } from "lucide-react";
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
import { transferProject as raw_transferProject } from "@/app/team/actions";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import { Avatar, initialsFor } from "@/components/AvatarEditor";

const transferProject = unwrapped(raw_transferProject);

export type Teammate = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string;
};

/** Pick a teammate to own this prototype. */
export function TransferDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  ownerId,
  teammates,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  projectName: string;
  ownerId: string;
  teammates: Teammate[];
}) {
  const router = useRouter();
  const people = teammates.filter((t) => t.user_id !== ownerId);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const pick = people.find((p) => p.user_id === to);

  return (
    <Dialog open={open} onOpenChange={(o) => (o && setTo(""), onOpenChange(o))}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            The new owner controls publishing, sharing and deleting{" "}
            {projectName}. Everyone on the team keeps access.
          </DialogDescription>
        </DialogHeader>
        {people.length ? (
          <RadioGroup
            value={to}
            onValueChange={setTo}
            className="max-h-72 gap-1.5 overflow-y-auto"
          >
            {people.map((p) => (
              <RadioGroupCard
                key={p.user_id}
                value={p.user_id}
                className="items-center"
              >
                <Avatar
                  url={p.avatar_url}
                  initials={initialsFor(p.display_name, p.email)}
                  className="size-8 text-xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {p.display_name || p.email}
                  </span>
                  {p.display_name && (
                    <span className="block truncate text-xs text-stone-500">
                      {p.email}
                    </span>
                  )}
                </span>
              </RadioGroupCard>
            ))}
          </RadioGroup>
        ) : (
          <p className="rounded-2xl bg-stone-50 p-4 text-[13px] text-stone-600">
            Nobody else is on this prototype&apos;s team yet. Invite people from
            team settings first.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!pick}
            loading={busy}
            onClick={async () => {
              if (!pick) return;
              setBusy(true);
              try {
                await transferProject(projectId, pick.user_id);
                notify.success(
                  `${pick.display_name || pick.email} now owns ${projectName}`,
                );
                onOpenChange(false);
                router.refresh();
              } catch (e) {
                notify.error(
                  e instanceof Error ? e.message : "Couldn't transfer it.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <UserRoundCheck />
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
