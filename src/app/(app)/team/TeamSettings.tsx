"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  LogOut,
  Monitor,
  Plus,
  Smartphone,
  Sparkles,
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
  resendInvite as raw_resendInvite,
  removeFromTeam as raw_removeFromTeam,
  removeTeamDevice as raw_removeTeamDevice,
  shareGitHub as raw_shareGitHub,
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
  ROLE_LABEL,
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
import { formatUsd } from "@/lib/billing";
import { PLANS, type BillingInterval } from "@/lib/plans";
import { UpgradeForm } from "@/components/billing/UpgradeForm";

/** Team Pro: $20 a seat, with $10 of AI usage included per seat (same as Pro). */
const SEAT_MICROS = 20_000_000;
const INCLUDED_MICROS = 10_000_000;
import { GitHubMark } from "@/components/icons/GitHubMark";
import { Switch } from "@/components/ui/switch";
import { Avatar, initialsFor } from "@/components/AvatarEditor";
import { TeamBadge } from "@/components/teams/TeamSwitcherClient";
import { AnimatePresence, listItem, motion } from "@/components/motion";

const renameTeam = unwrapped(raw_renameTeam);
const inviteToTeam = unwrapped(raw_inviteToTeam);
const resendInvite = unwrapped(raw_resendInvite);
const changeTeamRole = unwrapped(raw_changeTeamRole);
const removeFromTeam = unwrapped(raw_removeFromTeam);
const deleteTeam = unwrapped(raw_deleteTeam);
const addTeamDevice = unwrapped(raw_addTeamDevice);
const removeTeamDevice = unwrapped(raw_removeTeamDevice);
const shareGitHub = unwrapped(raw_shareGitHub);

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

const VIEW_TITLE = {
  members: "Members",
  billing: "Billing",
  devices: "Devices",
} as const;

export function TeamSettings({
  view = "settings",
  ownerName = null,
  team,
  me,
  members,
  devices,
  prototypes,
  profiles = {},
  github = { mine: [], shared: [] },
  billing,
}: {
  view?: "settings" | "members" | "billing" | "devices";
  ownerName?: string | null;
  billing?: {
    plan: "free" | "team";
    seats: number;
    status: string | null;
    periodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasCustomer: boolean;
    usageMicros: number;
    interval: BillingInterval;
    reviewers: number;
  };
  github?: {
    mine: { id: number; login: string }[];
    shared: { id: number; login: string; byMe: boolean }[];
  };
  profiles?: Record<string, { name: string | null; avatar: string | null }>;
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

  const admins = members.filter(
    (m) => m.role === "admin" && m.status === "active",
  ).length;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-2 pt-10">
      {view === "settings" ? (
        <>
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
                      run(
                        "rename",
                        () => renameTeam(team.id, v),
                        "Team renamed",
                      );
                  }}
                  className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-1 font-display text-2xl font-bold tracking-tight outline-none hover:bg-stone-900/[.04] focus:bg-card focus:ring-2 focus:ring-raspberry-200"
                />
              </>
            ) : (
              <h1 className="flex-1 font-display text-2xl font-bold tracking-tight">
                {teamLabel(team, ownerName)}
              </h1>
            )}
            <Badge>{ROLE_LABEL[team.role]}</Badge>
          </div>
          <p className="text-sm text-stone-600">
            {team.personal
              ? "Your personal workspace is just you. Create a workspace from the workspace menu to share prototypes, devices and design systems with other people."
              : `Builders here can open and build on the workspace's ${prototypes} prototype${prototypes === 1 ? "" : "s"}, and use its devices and design systems. Reviewers can open, comment on and approve them for free. ${billing?.plan === "team" ? "Builds in team prototypes run on Team Pro." : "Builds count against each person's own plan until the workspace upgrades."}`}
          </p>
        </>
      ) : (
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {VIEW_TITLE[view as keyof typeof VIEW_TITLE]}
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            {view === "members"
              ? team.personal
                ? "Your personal workspace is just you."
                : `Builders in ${teamLabel(team)} can open and build on its prototypes. Reviewers can open, comment on and approve them, and are always free.`
              : view === "billing"
                ? `${teamLabel(team)} is billed per seat: one seat for each active builder. Reviewers are free.`
                : `Screen sizes everyone in ${teamLabel(team, ownerName)} can pick when previewing a prototype.`}
          </p>
        </div>
      )}

      {view === "billing" && !team.personal && billing && (
        <Section
          title="Plan"
          action={
            billing.plan === "team" ? (
              <Badge className="bg-raspberry-50 text-raspberry-800">
                Team Pro
              </Badge>
            ) : (
              <Badge>Free</Badge>
            )
          }
        >
          {billing.plan === "team" ? (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <dl className="grid flex-1 basis-72 grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-stone-500">Builder seats</dt>
                  <dd className="font-semibold">
                    {billing.seats} ·{" "}
                    {billing.interval === "year"
                      ? `${formatUsd(billing.seats * PLANS.team.annualUsdPerBuilder * 1_000_000, 0)}/yr`
                      : `${formatUsd(billing.seats * SEAT_MICROS, 0)}/mo`}
                    {billing.reviewers > 0 && (
                      <span className="block text-xs font-normal text-emerald-700">
                        + {billing.reviewers} reviewer
                        {billing.reviewers === 1 ? "" : "s"}, free
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">
                    {billing.interval === "year"
                      ? "AI usage this month"
                      : "AI usage this period"}
                  </dt>
                  <dd className="font-semibold">
                    {formatUsd(billing.usageMicros)}{" "}
                    <span className="font-normal text-stone-500">
                      of {formatUsd(billing.seats * INCLUDED_MICROS, 0)}{" "}
                      included
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">
                    {billing.cancelAtPeriodEnd ? "Ends" : "Renews"}
                  </dt>
                  <dd className="font-semibold" suppressHydrationWarning>
                    {billing.periodEnd
                      ? new Date(billing.periodEnd).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )
                      : "—"}
                  </dd>
                </div>
              </dl>
              {admin && billing.hasCustomer && (
                <form action="/api/billing/team-portal" method="post">
                  <input type="hidden" name="team_id" value={team.id} />
                  <Button type="submit" variant="outline">
                    <CreditCard />
                    Manage billing
                  </Button>
                </form>
              )}
              <p className="w-full text-xs text-stone-500">
                Seats follow the team: adding or removing a builder adjusts the
                next invoice. Reviewers never use a seat. Usage beyond
                what&apos;s included is billed to the team at the end of each
                month. Failed builds are never billed.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1 text-[13px] text-stone-600">
                <p className="font-semibold text-stone-900">
                  Team Pro · $20 per builder a month · reviewers free
                </p>
                <p className="mt-1">
                  Everyone gets Pro build limits on team prototypes, with{" "}
                  {formatUsd(INCLUDED_MICROS, 0)} of AI usage included per seat
                  and pooled across the team. Right now that&apos;s{" "}
                  {billing.seats} seat{billing.seats === 1 ? "" : "s"}:{" "}
                  {formatUsd(billing.seats * SEAT_MICROS, 0)}/month.
                </p>
              </div>
              {admin ? (
                <UpgradeForm
                  action="/api/billing/team-checkout"
                  monthlyUsd={PLANS.team.monthlyUsdPerBuilder}
                  annualUsd={PLANS.team.annualUsdPerBuilder}
                  unit=" per builder"
                  button={() => (
                    <Button type="submit">
                      <Sparkles />
                      Upgrade team
                    </Button>
                  )}
                >
                  <input type="hidden" name="team_id" value={team.id} />
                </UpgradeForm>
              ) : (
                <p className="text-xs text-stone-500">
                  Ask a team admin to upgrade.
                </p>
              )}
            </div>
          )}
        </Section>
      )}

      {view === "members" && team.personal && (
        <section className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-stone-200 px-6 py-10 text-center">
          <Users className="size-6 text-stone-400" aria-hidden="true" />
          <p className="text-sm font-medium">No one else here yet</p>
          <p className="max-w-sm text-[13px] text-stone-600">
            To work with other people, create a workspace from the workspace
            menu and invite them there.
          </p>
        </section>
      )}
      {view === "members" && !team.personal && (
        <Section title={`People · ${members.length}`}>
          {admin && (
            <form
              className="mb-4 flex flex-wrap gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const to = email.trim();
                const ok = await run("invite", async () => {
                  const r = await inviteToTeam(team.id, to, role);
                  if (r.emailed)
                    notify.success(`Invited ${to}`, {
                      description:
                        "They'll get an email with a link to accept.",
                    });
                  else
                    notify.success(`Invited ${to}`, {
                      description:
                        "Email isn't set up yet, so tell them to sign in and open Invites from the team menu.",
                    });
                });
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
                className="min-w-0 flex-1 max-sm:basis-full"
              />
              <Select
                value={role}
                onValueChange={(v) => setRole(v as TeamRole)}
              >
                <SelectTrigger aria-label="Role" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Builder</SelectItem>
                  <SelectItem value="reviewer">Reviewer · free</SelectItem>
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
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
                  >
                    <Avatar
                      url={m.user_id ? profiles[m.user_id]?.avatar : null}
                      initials={initialsFor(
                        m.user_id ? profiles[m.user_id]?.name : null,
                        m.email,
                      )}
                      className="size-8 text-xs"
                    />
                    <span className="min-w-0 flex-1 max-sm:basis-[calc(100%-2.75rem)]">
                      <span className="block truncate text-sm font-medium">
                        {(m.user_id && profiles[m.user_id]?.name) || m.email}
                        {self && (
                          <span className="font-normal text-stone-500">
                            {" "}
                            (you)
                          </span>
                        )}
                      </span>
                      {m.user_id && profiles[m.user_id]?.name && (
                        <span className="block truncate text-xs text-stone-500">
                          {m.email}
                        </span>
                      )}
                      {m.status === "pending" && (
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                          Invited · waiting for them to accept
                          {admin && (
                            <button
                              type="button"
                              className="font-medium text-raspberry-700 hover:underline disabled:opacity-50"
                              disabled={busy === `resend-${m.email}`}
                              onClick={() =>
                                run(
                                  `resend-${m.email}`,
                                  () => resendInvite(team.id, m.email),
                                  `Sent the invite to ${m.email} again`,
                                )
                              }
                            >
                              Send again
                            </button>
                          )}
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
                          className="h-8 w-28 max-sm:ml-11"
                          disabled={busy === `role-${m.email}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Builder</SelectItem>
                          <SelectItem value="reviewer">Reviewer</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className="max-sm:ml-11">
                        {ROLE_LABEL[m.role]}
                      </Badge>
                    )}
                    {m.role === "reviewer" && (
                      <Badge className="bg-emerald-50 text-emerald-800">
                        Free
                      </Badge>
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

      {view === "settings" && !team.personal && (
        <Section title="GitHub">
          <p className="-mt-2 mb-4 text-[13px] text-stone-600">
            Share a GitHub account you connected so everyone on the team can
            import repositories and build from them. Realframe only ever reads.
          </p>
          <ul className="space-y-1.5">
            {[
              ...github.shared.map((g) => ({
                ...g,
                isShared: true,
                canToggle: admin && g.byMe,
              })),
              ...github.mine
                .filter((m) => !github.shared.some((g) => g.id === m.id))
                .map((g) => ({
                  ...g,
                  isShared: false,
                  byMe: true,
                  canToggle: admin,
                })),
            ].map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-3 rounded-2xl bg-stone-50 px-3 py-2"
              >
                <GitHubMark className="size-4" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {g.login}
                </span>
                {g.isShared && !g.byMe && (
                  <span className="text-xs text-stone-500">
                    Shared by a teammate
                  </span>
                )}
                {g.canToggle ? (
                  <Switch
                    checked={g.isShared}
                    aria-label={`Share ${g.login} with the team`}
                    loading={busy === `gh-${g.id}`}
                    onCheckedChange={(on) =>
                      run(
                        `gh-${g.id}`,
                        () => shareGitHub(team.id, g.id, on),
                        on
                          ? `${g.login} is shared with the team`
                          : `Stopped sharing ${g.login}`,
                      )
                    }
                  />
                ) : (
                  g.isShared && <Badge variant="success">Shared</Badge>
                )}
              </li>
            ))}
          </ul>
          {github.mine.length === 0 && github.shared.length === 0 && (
            <p className="text-[13px] text-stone-500">
              No GitHub accounts yet. Connect one from Import › GitHub on the
              prototypes page{admin ? ", then share it here" : ""}.
            </p>
          )}
        </Section>
      )}

      {view === "devices" && (
        <Section title="Workspace devices">
          <p className="-mt-2 mb-4 text-[13px] text-stone-600">
            Your own screens, like a rugged tablet or a kitchen display. They
            show up in every team prototype&apos;s device menu.
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
                  onValueChange={(v) =>
                    setDev({ ...dev, kind: v as DeviceKind })
                  }
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
                      setDev({
                        ...dev,
                        width: e.target.value.replace(/\D/g, ""),
                      })
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
                <span
                  id="dev-frame"
                  className="text-sm font-medium leading-none"
                >
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
      )}

      {view === "settings" && admin && !team.personal && (
        <Section title="Delete workspace">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 basis-56 text-[13px] text-stone-600">
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
      {view === "settings" && team.personal && (
        <p className="flex items-center gap-2 text-xs text-stone-500">
          <Users className="size-3.5" aria-hidden="true" />
          Your personal workspace can&apos;t have other members or be deleted.
        </p>
      )}
    </main>
  );
}
