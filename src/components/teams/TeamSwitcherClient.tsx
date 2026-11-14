"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Mail, Plus, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createTeam as raw_createTeam,
  switchTeam as raw_switchTeam,
} from "@/app/(app)/team/actions";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import { teamLabel, type Team } from "@/lib/team-shared";
import { cn } from "@/lib/utils";

const createTeam = unwrapped(raw_createTeam);
const switchTeam = unwrapped(raw_switchTeam);

export function TeamBadge({
  team,
  className,
}: {
  team: Pick<Team, "name" | "personal">;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-lg text-[11px] font-semibold text-white",
        team.personal
          ? "bg-[linear-gradient(135deg,#c2410c_0%,#be185d_55%,#7c3aed_100%)]"
          : "bg-foreground text-background",
        className,
      )}
    >
      {team.personal ? (
        <Users className="size-3.5" />
      ) : (
        (team.name.trim()[0] ?? "T").toUpperCase()
      )}
    </span>
  );
}

export function TeamSwitcherClient({
  teams,
  currentId,
  invites = 0,
  variant = "bar",
  subtitle,
  ownerName,
}: {
  teams: Team[];
  currentId: string;
  /** Open team invites for the signed-in person. */
  invites?: number;
  variant?: "bar" | "sidebar" | "rail";
  /** Second line in the sidebar trigger, e.g. "Team Pro · 4 members". */
  subtitle?: string;
  ownerName?: string | null;
}) {
  const router = useRouter();
  const current = teams.find((t) => t.id === currentId)!;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(t: Team) {
    if (t.id === currentId) return;
    try {
      await switchTeam(t.id);
      router.refresh();
    } catch (e) {
      notify.error(
        e instanceof Error ? e.message : "Couldn't switch workspaces.",
      );
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createTeam(name);
      setCreating(false);
      setName("");
      notify.success(`Created ${name.trim()}`, {
        description: "Invite people from Members.",
      });
      router.push("/team/members");
      router.refresh();
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Couldn't create the workspace.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "rail" ? (
            <button
              type="button"
              className="grid size-10 place-items-center rounded-xl transition-colors hover:bg-foreground/[.05] data-[state=open]:bg-foreground/[.07]"
              aria-label={`Workspace: ${teamLabel(current, ownerName)}. Switch workspace`}
              title={teamLabel(current, ownerName)}
            >
              <TeamBadge team={current} className="size-8 rounded-xl" />
            </button>
          ) : variant === "sidebar" ? (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-2xl bg-card/70 p-2 text-left shadow-[inset_0_0_0_1px_var(--color-border)] transition-colors hover:bg-card data-[state=open]:bg-card"
              aria-label={`Workspace: ${teamLabel(current, ownerName)}. Switch workspace`}
            >
              <TeamBadge team={current} className="size-8 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">
                  {teamLabel(current, ownerName)}
                </span>
                {subtitle && (
                  <span className="block truncate text-[11px] text-stone-500">
                    {subtitle}
                  </span>
                )}
              </span>
              <ChevronDown className="size-4 shrink-0 text-stone-400" />
            </button>
          ) : (
            <Button
              variant="ghost"
              className="gap-2 pl-1.5 pr-2.5"
              aria-label={`Team: ${teamLabel(current)}. Switch team`}
            >
              <TeamBadge team={current} />
              <span className="max-w-[12rem] truncate font-semibold">
                {teamLabel(current)}
              </span>
              {invites > 0 && (
                <span
                  className="grid size-4.5 min-w-4.5 place-items-center rounded-full bg-raspberry-600 px-1 text-[10px] font-bold text-white"
                  aria-label={`${invites} team invite${invites === 1 ? "" : "s"}`}
                >
                  {invites}
                </span>
              )}
              <ChevronDown className="text-stone-400" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className={
            variant === "sidebar"
              ? "w-(--radix-dropdown-menu-trigger-width) min-w-56"
              : "w-64"
          }
        >
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {teams.map((t) => (
            <DropdownMenuItem
              key={t.id}
              onSelect={() => pick(t)}
              className="gap-2.5"
            >
              <TeamBadge team={t} />
              <span className="min-w-0 flex-1 truncate">
                {teamLabel(t, ownerName)}
              </span>
              {t.id === currentId && (
                <Check
                  className="size-4 text-raspberry-600"
                  aria-label="Current workspace"
                />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {invites > 0 && (
            <DropdownMenuItem asChild>
              <Link href="/invites">
                <Mail />
                Invites
                <span className="ml-auto rounded-full bg-raspberry-600 px-1.5 text-[10px] font-bold text-white">
                  {invites}
                </span>
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus />
            Create workspace
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/team">
              <Settings />
              Workspace settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={create} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Create a workspace</DialogTitle>
              <DialogDescription>
                Everyone in a workspace shares its prototypes, devices and
                design systems. Builds count against each person&apos;s own plan
                until the workspace upgrades to Team Pro.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="team-name">Workspace name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                autoFocus
                placeholder="e.g. Field Ops design"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={busy}>
                <Plus />
                Create workspace
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
