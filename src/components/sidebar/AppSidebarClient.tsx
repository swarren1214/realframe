"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useSidebar } from "./AppShell";
import { Mark } from "@/components/Logo";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CreditCard,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
  LayoutGrid,
  Mail,
  Menu,
  MonitorSmartphone,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { TeamSwitcherClient } from "@/components/teams/TeamSwitcherClient";
import type { Team } from "@/lib/team-shared";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Other paths that count as this item. */
  also?: string[];
  exact?: boolean;
  count?: number;
};

type Props = {
  teams: Team[];
  currentId: string;
  invites: number;
  plan: "free" | "pro" | "team";
  members: number;
  ownerName: string | null;
  account: React.ReactNode;
  accountCompact: React.ReactNode;
};

function groups(personal: boolean, invites: number) {
  const build: Item[] = [
    { href: "/projects", label: "Prototypes", icon: LayoutGrid },
    { href: "/design-systems", label: "Design systems", icon: Layers },
    { href: "/devices", label: "Devices", icon: MonitorSmartphone },
  ];
  const workspace: Item[] = [
    { href: "/team/members", label: "Members", icon: Users },
    personal
      ? { href: "/billing", label: "Billing", icon: CreditCard }
      : {
          href: "/team/billing",
          label: "Billing",
          icon: CreditCard,
          also: ["/billing"],
        },
    { href: "/team", label: "Settings", icon: Settings, exact: true },
  ];
  const you: Item[] =
    invites > 0
      ? [{ href: "/invites", label: "Invites", icon: Mail, count: invites }]
      : [];
  return [
    { label: "Build", items: build },
    { label: "Workspace", items: workspace },
    ...(you.length ? [{ label: "You", items: you }] : []),
  ];
}

function NavLink({
  item,
  path,
  rail = false,
}: {
  item: Item;
  path: string;
  rail?: boolean;
}) {
  const match = (h: string) =>
    item.exact ? path === h : path === h || path.startsWith(`${h}/`);
  const on = match(item.href) || (item.also ?? []).some(match);
  const Icon = item.icon;
  if (rail)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            aria-current={on ? "page" : undefined}
            aria-label={item.label}
            className={cn(
              "relative grid size-10 place-items-center rounded-xl no-underline transition-colors duration-(--duration-fast)",
              on
                ? "bg-foreground/[.07] text-foreground"
                : "text-stone-500 hover:bg-foreground/[.04] hover:text-foreground",
            )}
          >
            <Icon className={cn("size-[18px]", on && "text-raspberry-600")} />
            {item.count ? (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-raspberry-600 px-1 text-[9px] font-bold text-white">
                {item.count}
              </span>
            ) : null}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-xl px-2.5 text-[13px] font-medium no-underline transition-colors duration-(--duration-fast)",
        on
          ? "bg-foreground/[.07] text-foreground"
          : "text-stone-600 hover:bg-foreground/[.04] hover:text-foreground",
      )}
    >
      <Icon
        className={cn("size-4", on ? "text-raspberry-600" : "text-stone-400")}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.count ? (
        <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-raspberry-600 px-1 text-[10px] font-bold text-white">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

function Body({
  rail = false,
  onToggle,
  teams,
  currentId,
  invites,
  plan,
  members,
  ownerName,
  account,
  accountCompact,
}: Props & { rail?: boolean; onToggle?: () => void }) {
  const path = usePathname();
  const current = teams.find((t) => t.id === currentId)!;
  const planLabel =
    plan === "team" ? "Team Pro" : plan === "pro" ? "Pro" : "Free";
  const subtitle = current.personal
    ? `${planLabel} · Just you`
    : `${planLabel} · ${members} member${members === 1 ? "" : "s"}`;
  const upgradeHref = current.personal ? "/billing" : "/team/billing";
  const toggleButton = onToggle && (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={rail ? "Expand sidebar" : "Collapse sidebar"}
          className="text-stone-500"
        >
          {rail ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {rail ? "Expand" : "Collapse"} <span className="opacity-60">{"⌘\\"}</span>
      </TooltipContent>
    </Tooltip>
  );
  if (rail)
    return (
      <div className="flex h-full flex-col items-center gap-3 px-2 py-3">
        <Link
          href="/projects"
          aria-label="Realframe"
          className="grid size-10 place-items-center"
        >
          <Mark />
        </Link>
        <TeamSwitcherClient
          teams={teams}
          currentId={currentId}
          invites={invites}
          variant="rail"
          ownerName={ownerName}
        />
        <nav aria-label="Sections" className="flex flex-col items-center gap-1">
          {groups(current.personal, invites).map((g, gi) => (
            <div key={g.label} className="flex flex-col items-center gap-1">
              {gi > 0 && (
                <span
                  aria-hidden="true"
                  className="my-1.5 h-px w-6 bg-stone-200"
                />
              )}
              {g.items.map((i) => (
                <NavLink key={i.href} item={i} path={path} rail />
              ))}
            </div>
          ))}
        </nav>
        <div className="flex-1" />
        {plan === "free" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={upgradeHref}
                aria-label="Upgrade"
                className="grid size-10 place-items-center rounded-xl bg-glow-soft text-raspberry-600 no-underline shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]"
              >
                <Sparkles className="size-[18px]" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              {current.personal ? "Upgrade to Pro" : "Upgrade to Team Pro"}
            </TooltipContent>
          </Tooltip>
        )}
        {toggleButton}
        <div className="border-t border-stone-100 pt-2">{accountCompact}</div>
      </div>
    );
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center justify-between pl-2 pt-0.5">
        <Logo href="/projects" />
        {toggleButton}
      </div>
      <TeamSwitcherClient
        teams={teams}
        currentId={currentId}
        invites={invites}
        variant="sidebar"
        subtitle={subtitle}
        ownerName={ownerName}
      />
      <nav aria-label="Sections" className="flex flex-col gap-4">
        {groups(current.personal, invites).map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-stone-400">
              {g.label}
            </p>
            {g.items.map((i) => (
              <NavLink key={i.href} item={i} path={path} />
            ))}
          </div>
        ))}
      </nav>
      <div className="flex-1" />
      {plan === "free" && (
        <Link
          href={upgradeHref}
          className="group rounded-2xl bg-glow-soft p-3 no-underline shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <Sparkles className="size-3.5 text-raspberry-600" />
            {current.personal ? "Upgrade to Pro" : "Upgrade to Team Pro"}
          </span>
          <span className="mt-0.5 block text-xs text-stone-600">
            {current.personal
              ? "More builds and AI usage included."
              : "Pooled usage, billed per seat."}
          </span>
        </Link>
      )}
      <div className="border-t border-stone-100 pt-2">{account}</div>
    </div>
  );
}

export function AppSidebarClient(props: Props) {
  const [open, setOpen] = useState(false);
  const { collapsed, toggle } = useSidebar();
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  const current = props.teams.find((t) => t.id === props.currentId)!;
  return (
    <>
      <aside
        aria-label="App"
        data-collapsed={collapsed || undefined}
        className={cn(
          "glass fixed inset-y-3 left-3 z-30 hidden overflow-y-auto overflow-x-hidden rounded-[1.75rem] transition-[width] duration-(--duration-base) ease-(--ease-out) lg:block",
          collapsed ? "w-[4.5rem]" : "w-60",
        )}
      >
        <Body {...props} rail={collapsed} onToggle={toggle} />
      </aside>

      <header className="glass sticky top-3 z-30 mx-auto mt-3 flex max-w-5xl items-center gap-2 rounded-full py-1.5 pl-1.5 pr-1.5 lg:hidden">
        <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
          <DialogPrimitive.Trigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu />
            </Button>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-stone-950/30 backdrop-blur-[2px] dark:bg-black/60" />
            <DialogPrimitive.Content className="glass fixed inset-y-2 left-2 z-50 w-72 max-w-[85vw] overflow-y-auto rounded-[1.75rem] outline-none">
              <DialogPrimitive.Title className="sr-only">
                Menu
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2"
                  aria-label="Close menu"
                >
                  <X />
                </Button>
              </DialogPrimitive.Close>
              <Body {...props} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
        <Logo href="/projects" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {current.personal
            ? props.ownerName
              ? `${props.ownerName.split(/\s+/)[0]}'s workspace`
              : "Personal workspace"
            : current.name}
        </span>
        {props.invites > 0 && (
          <Link
            href="/invites"
            aria-label={`${props.invites} invites`}
            className="grid h-5 min-w-5 place-items-center rounded-full bg-raspberry-600 px-1 text-[11px] font-bold text-white no-underline"
          >
            {props.invites}
          </Link>
        )}
        {props.accountCompact}
      </header>
    </>
  );
}
