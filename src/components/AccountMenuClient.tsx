"use client";
import Link from "next/link";
import {
  ChevronDown,
  CreditCard,
  ExternalLink,
  FolderOpen,
  LogOut,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme, type ThemeChoice } from "@/components/theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatUsd } from "@/lib/billing";
import { cn } from "@/lib/utils";

type Usage = {
  used: number;
  limit: number;
  usageMicros: number;
  includedMicros: number;
  periodEnd: string;
};

function initialsFor(name: string | null, email: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length)
    return (
      (parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
    ).toUpperCase();
  return (email[0] ?? "").toUpperCase();
}

function Avatar({ initials, size }: { initials: string; size: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#c2410c_0%,#be185d_55%,#7c3aed_100%)] font-semibold text-white",
        size === "sm" ? "size-8 text-xs" : "size-10 text-sm",
      )}
    >
      {initials || <UserRound className="size-4" />}
    </span>
  );
}

function Meter({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/8">
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#c2410c,#be185d)]"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

const shortDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function AccountMenuClient({
  compact,
  name,
  email,
  plan,
  usage,
}: {
  compact: boolean;
  name: string | null;
  email: string;
  plan: "free" | "pro";
  usage: Usage | null;
}) {
  const initials = initialsFor(name, email);
  const first = name?.trim().split(/\s+/)[0] || email.split("@")[0];
  const label = `Account menu for ${name || email}`;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 data-[state=open]:ring-[3px] data-[state=open]:ring-ring/30"
            aria-label={label}
            title={label}
          >
            <Avatar initials={initials} size="sm" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="h-10 gap-2 pl-1 pr-2.5 text-foreground data-[state=open]:bg-foreground/6 data-[state=open]:ring-[3px] data-[state=open]:ring-ring/30 [&>svg:last-child]:transition-transform data-[state=open]:[&>svg:last-child]:rotate-180"
            aria-label={label}
          >
            <Avatar initials={initials} size="sm" />
            <span className="max-w-32 truncate">{first}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[300px]">
        <DropdownMenuLabel className="flex items-center gap-2.5 p-2.5 font-normal">
          <Avatar initials={initials} size="lg" />
          <span className="min-w-0">
            {name && (
              <span className="block truncate text-[13px] font-semibold">
                {name}
              </span>
            )}
            <span
              className={cn(
                "block truncate",
                name
                  ? "text-xs text-muted-foreground"
                  : "text-[13px] font-semibold",
              )}
            >
              {email}
            </span>
          </span>
        </DropdownMenuLabel>

        {usage && (
          <div
            className={cn(
              "mx-1 mb-1.5 mt-0.5 rounded-2xl p-3",
              plan === "pro"
                ? "bg-stone-50 shadow-[inset_0_0_0_1px_var(--color-border)]"
                : "bg-glow-soft shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]",
            )}
          >
            <div className="flex items-center gap-1.5">
              {plan === "pro" ? (
                <Badge className="btn-glow shadow-none">
                  <Sparkles />
                  Pro
                </Badge>
              ) : (
                <Badge className="bg-card">Free plan</Badge>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {plan === "pro" ? "Renews" : "Resets"}{" "}
                {shortDate(usage.periodEnd)}
              </span>
            </div>
            {plan === "pro" ? (
              <>
                <p className="mb-1.5 mt-2.5 text-xs text-stone-700">
                  <strong className="font-semibold text-foreground">
                    {formatUsd(usage.usageMicros)}
                  </strong>{" "}
                  of {formatUsd(usage.includedMicros)} AI usage included
                </p>
                <Meter
                  pct={
                    usage.includedMicros > 0
                      ? (usage.usageMicros / usage.includedMicros) * 100
                      : 0
                  }
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Usage past {formatUsd(usage.includedMicros, 0)} is billed at
                  cost + 50%.
                </p>
              </>
            ) : (
              <>
                <p className="mb-1.5 mt-2.5 text-xs text-stone-700">
                  <strong className="font-semibold text-foreground">
                    {usage.used}
                  </strong>{" "}
                  of {usage.limit} builds used
                </p>
                <Meter pct={(usage.used / Math.max(usage.limit, 1)) * 100} />
                <form
                  action="/api/billing/checkout"
                  method="post"
                  className="mt-3"
                >
                  <Button
                    type="submit"
                    variant="default"
                    size="sm"
                    className="w-full"
                  >
                    <Sparkles />
                    Upgrade to Pro · $20/mo
                  </Button>
                </form>
              </>
            )}
          </div>
        )}

        <DropdownMenuItem asChild>
          <Link href="/projects">
            <FolderOpen />
            My prototypes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/welcome?edit=1">
            <UserRound />
            <span className="flex-1">Profile</span>
            <span className="text-[11px] text-muted-foreground">
              Name, email
            </span>
          </Link>
        </DropdownMenuItem>
        {plan === "pro" ? (
          <DropdownMenuItem asChild>
            <button type="submit" form="rf-billing-portal" className="w-full">
              <CreditCard />
              <span className="flex-1 text-left">Manage billing</span>
              <ExternalLink className="size-3!" />
            </button>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/billing">
              <CreditCard />
              Billing &amp; plan
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span id="appearance-l" className="flex-1 text-[13px] text-stone-700">
            Appearance
          </span>
          <ThemeSwitch />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" asChild>
          <button type="submit" form="rf-signout" className="w-full">
            <LogOut />
            Sign out
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>

      {/* Forms live outside the portalled menu so their buttons can submit them by id. */}
      <form id="rf-signout" action="/auth/signout" method="post" hidden />
      <form
        id="rf-billing-portal"
        action="/api/billing/portal"
        method="post"
        hidden
      />
    </DropdownMenu>
  );
}

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Match system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** System, light or dark, as three small icon buttons. */
function ThemeSwitch() {
  const { choice, setChoice } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-labelledby="appearance-l"
      className="flex rounded-full bg-foreground/5 p-0.5"
    >
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={label}
          title={label}
          onClick={(e) => {
            e.preventDefault();
            setChoice(value);
          }}
          className={cn(
            "grid size-7 place-items-center rounded-full text-stone-500 transition-colors hover:text-foreground",
            choice === value &&
              "bg-card text-foreground shadow-[0_1px_3px_rgba(28,25,23,.12)] dark:bg-white/12",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
