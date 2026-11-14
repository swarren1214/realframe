"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut,
  Monitor,
  Plus,
  Smartphone,
  Tablet,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  addTeamDevice as raw_addTeamDevice,
  changeTeamRole as raw_changeTeamRole,
  deleteTeam as raw_deleteTeam,
  inviteToTeam as raw_inviteToTeam,
  removeFromTeam as raw_removeFromTeam,
  removeTeamDevice as raw_removeTeamDevice,
  renameTeam as raw_renameTeam,
} from "./actions";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import {
  teamLabel,
  type Team,
  type TeamDeviceRow,
  type TeamMember,
  type TeamRole,
} from "@/lib/team-shared";
import type { DeviceKind } from "@/lib/devices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Eyebrow } from "@/components/Eyebrow";
import { TeamBadge } from "@/components/teams/TeamSwitcherClient";
import { AnimatePresence, listItem, motion } from "@/components/motion";

const renameTeam = unwrapped(raw_renameTeam);
const inviteToTeam = unwrapped(raw_inviteToTeam);
const changeTeamRole = unwrapped(raw_changeTeamRole);
const removeFromTeam = unwrapped(raw_removeFromTeam);
const deleteTeam = unwrapped(raw_deleteTeam);
const addTeamDevice = unwrapped(raw_addTeamDevice);
const removeTeamDevice = unwrapped(raw_removeTeamDevice);

const KIND_ICON = {
  desktop: Monitor,
  tablet: Tablet,
  phone: Smartphone,
} as const;

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-stone-200/80 bg-card p-5 shadow-[0_12px_32px_-24px_rgba(28,25,23,.35)]">
      <div className="mb-4 flex items-center gap-3">
        <Eyebrow>{title}</Eyebrow>
        <div className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function TeamSettings({
  team,
  me,
  members,
  devices,
  prototypes,
}: {
  team: Team;
  me: string;
  members: TeamMember[];
  devices: TeamDeviceRow[];
  prototypes: number;
}) {
  const router = useRouter();
  const admin = team.role === "admin";
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const [dev, setDev] = useState({
    name: "",
    kind: "tablet" as DeviceKind,
    width: "",
    height: "",
    frame: "bezel" as "bezel" | "none",
  });

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try {
      await fn();
      if (done) notify.success(done);
      router.refresh();
      return true;
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "That didn't work.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const admins = members.filter((m) => m.role === "admin").length;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-2 pt-10">
      <div className="flex items-center gap-3">
        <TeamBadge team={team} className="size-10 rounded-xl text-base" />
        {admin && !team.personal ? (
          <>
            <label htmlFor="team-name" className="sr-only">
              Team name
            </label>
            <input
              id="team-name"
              defaultValue={team.name}
              maxLength={60}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) e.target.value = team.name;
                else if (v !== team.name)
                  run("rename", () => renameTeam(team.id, v), "Team renamed");
              }}
              className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-1 font-display text-2xl font-bold tracking-tight outline-none hover:bg-stone-900/[.04] focus:bg-card focus:ring-2 focus:ring-raspberry-200"
            />
          </>
        ) : (
          <h1 className="flex-1 font-display text-2xl font-bold tracking-tight">
            {teamLabel(team)}
          </h1>
        )}
        <Badge>{admin ? "Admin" : "Member"}</Badge>
      </div>
      <p className="text-sm text-stone-600">
        {team.personal
          ? "Your personal team is just you. Create a team from the menu at the top to share prototypes, devices and design systems with others."
          : `Everyone here can open and build on the team's ${prototypes} prototype${prototypes === 1 ? "" : "s"}, and use its devices and design systems. Builds count against each person's own plan.`}
      </p>

      {!team.personal && (
        <Section title={`People · ${members.length}`}>
          {admin && (
            <form
              className="mb-4 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(
                  "invite",
                  () => inviteToTeam(team.id, email, role),
                  `Invited ${email.trim()}`,
                );
                if (ok) setEmail("");
              }}
            >
              <label htmlFor="invite" className="sr-only">
                Email
              </label>
              <Input
                id="invite"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="min-w-0 flex-1"
              />
              <Select
                value={role}
                onValueChange={(v) => setRole(v as TeamRole)}
              >
                <SelectTrigger aria-label="Role" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" loading={busy === "invite"}>
                <UserPlus />
                Invite
              </Button>
            </form>
          )}
          <ul className="divide-y divide-stone-100">
            <AnimatePresence initial={false}>
              {members.map((m) => {
                const self = m.email === me;
                const lastAdmin = m.role === "admin" && admins === 1;
                return (
                  <motion.li
                    key={m.email}
                    {...listItem}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600"
                    >
                      {m.email[0]?.toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {m.email}
                        {self && (
                          <span className="font-normal text-stone-500">
                            {" "}
                            (you)
                          </span>
                        )}
                      </span>
                      {!m.user_id && (
                        <span className="text-xs text-stone-500">
                          Invited · joins when they sign in
                        </span>
                      )}
                    </span>
                    {admin && !self ? (
                      <Select
                        value={m.role}
                        onValueChange={(v) =>
                          run(
                            `role-${m.email}`,
                            () =>
                              changeTeamRole(team.id, m.email, v as TeamRole),
                            "Role changed",
                          )
                        }
                      >
                        <SelectTrigger
                          aria-label={`Role for ${m.email}`}
                          className="h-8 w-28"
                          disabled={busy === `role-${m.email}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge>{m.role === "admin" ? "Admin" : "Member"}</Badge>
                    )}
                    {self ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={lastAdmin}
                        title={
                          lastAdmin
                            ? "Make someone else an admin before you leave"
                            : undefined
                        }
                        loading={busy === "leave"}
                        onClick={async () => {
                          if (
                            await run(
                              "leave",
                              () => removeFromTeam(team.id, m.email),
                              `You left ${team.name}`,
                            )
                          )
                            router.push("/projects");
                        }}
                      >
                        <LogOut />
                        Leave
                      </Button>
                    ) : (
                      admin && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${m.email}`}
                          loading={busy === `rm-${m.email}`}
                          onClick={() =>
                            run(
                              `rm-${m.email}`,
                              () => removeFromTeam(team.id, m.email),
                              `Removed ${m.email}`,
                            )
                          }
                        >
                          <X />
                        </Button>
                      )
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </Section>
      )}

      <Section title="Team devices">
        <p className="-mt-2 mb-4 text-[13px] text-stone-600">
          Your own screens, like a rugged tablet or a kitchen display. They show
          up in every team prototype&apos;s device menu.
        </p>
        {devices.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            <AnimatePresence initial={false}>
              {devices.map((d) => {
                const Icon = KIND_ICON[d.kind];
                return (
                  <motion.li
                    key={d.id}
                    {...listItem}
                    className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2"
                  >
                    <Icon
                      className="size-4 text-stone-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {d.name}
                    </span>
                    <span className="font-mono text-xs text-stone-500">
                      {d.width} × {d.height}
                    </span>
                    {admin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${d.name}`}
                        loading={busy === `dev-${d.id}`}
                        onClick={() =>
                          run(
                            `dev-${d.id}`,
                            () => removeTeamDevice(d.id),
                            `Removed ${d.name}`,
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        {admin ? (
          <form
            className="grid gap-3 rounded-2xl border border-dashed border-stone-300 p-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                "add-dev",
                () =>
                  addTeamDevice(team.id, {
                    ...dev,
                    width: Number(dev.width),
                    height: Number(dev.height),
                  }),
                `Added ${dev.name.trim()}`,
              );
              if (ok)
                setDev((d) => ({ ...d, name: "", width: "", height: "" }));
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="dev-name">Name</Label>
              <Input
                id="dev-name"
                required
                maxLength={60}
                value={dev.name}
                onChange={(e) => setDev({ ...dev, name: e.target.value })}
                placeholder="Kitchen display"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="dev-kind">Type</Label>
              <Select
                value={dev.kind}
                onValueChange={(v) => setDev({ ...dev, kind: v as DeviceKind })}
              >
                <SelectTrigger id="dev-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tablet">Tablet</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="desktop">Desktop or display</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium leading-none">
                Screen size (CSS pixels)
              </span>
              <div className="flex items-center gap-2">
                <Input
                  aria-label="Width"
                  required
                  inputMode="numeric"
                  value={dev.width}
                  onChange={(e) =>
                    setDev({ ...dev, width: e.target.value.replace(/\D/g, "") })
                  }
                  placeholder="1920"
                  className="font-mono"
                />
                <span className="text-stone-400">×</span>
                <Input
                  aria-label="Height"
                  required
                  inputMode="numeric"
                  value={dev.height}
                  onChange={(e) =>
                    setDev({
                      ...dev,
                      height: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="1080"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <span id="dev-frame" className="text-sm font-medium leading-none">
                Frame
              </span>
              <ToggleGroup
                type="single"
                aria-labelledby="dev-frame"
                value={dev.frame}
                onValueChange={(v) =>
                  v && setDev({ ...dev, frame: v as "bezel" | "none" })
                }
              >
                <ToggleGroupItem value="bezel">Bezel</ToggleGroupItem>
                <ToggleGroupItem value="none">None</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                variant="outline"
                loading={busy === "add-dev"}
              >
                <Plus />
                Add device
              </Button>
            </div>
          </form>
        ) : (
          devices.length === 0 && (
            <p className="text-[13px] text-stone-500">
              No team devices yet. Admins can add them.
            </p>
          )
        )}
      </Section>

      {admin && !team.personal && (
        <Section title="Delete team">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] text-stone-600">
              {prototypes
                ? `Move or delete the team's ${prototypes} prototype${prototypes === 1 ? "" : "s"} first.`
                : "Removes the team, its devices and its design systems for everyone."}
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={prototypes > 0}>
                  <Trash2 />
                  Delete team
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {team.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Everyone loses access to the team&apos;s devices and design
                    systems. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      if (
                        await run(
                          "delete",
                          () => deleteTeam(team.id),
                          `Deleted ${team.name}`,
                        )
                      )
                        router.push("/projects");
                    }}
                  >
                    Delete team
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Section>
      )}
      {team.personal && (
        <p className="flex items-center gap-2 text-xs text-stone-500">
          <Users className="size-3.5" aria-hidden="true" />
          Your personal team can&apos;t have other members or be deleted.
        </p>
      )}
    </main>
  );
}
