"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Info,
  Layers,
  Package,
  Palette,
  Plus,
  TriangleAlert,
  Upload,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  swatches,
  sourceLabel,
  type DesignSystem,
} from "@/lib/design-systems/types";
import { teamLabel, type Team } from "@/lib/team-shared";
import { ImportDesignSystem } from "@/components/design-systems/ImportDesignSystem";
import { AnimatePresence, listItem, motion } from "@/components/motion";
import { cn } from "@/lib/utils";
import { GitHubMark } from "@/components/icons/GitHubMark";

export const SOURCE_ICON = {
  github: GitHubMark,
  npm: Package,
  storybook: BookOpen,
  upload: Upload,
} as const;

export function KindBadge({ kind }: { kind: DesignSystem["kind"] }) {
  if (kind === "components")
    return <Badge variant="success">Real components</Badge>;
  if (kind === "styles")
    return <Badge className="bg-blue-50 text-blue-800">Styles only</Badge>;
  return null;
}

export function Swatches({
  colors,
  size = 26,
}: {
  colors: string[];
  size?: number;
}) {
  return (
    <span className="inline-flex" aria-hidden="true">
      {colors.map((c, i) => (
        <span
          key={i}
          className="rounded-full border-2 border-card"
          style={{
            width: size,
            height: size,
            background: c,
            marginLeft: i ? -size / 4 : 0,
          }}
        />
      ))}
    </span>
  );
}

/** While anything is importing, check back every few seconds. */
export function usePollWhile(on: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [on, router]);
}

function Card({
  ds,
  used,
  rules,
}: {
  ds: DesignSystem;
  used: number;
  rules: number;
}) {
  const Icon = SOURCE_ICON[ds.source_kind];
  const colors = swatches(ds.tokens);
  const font = ds.tokens.fonts?.[0]?.family;
  return (
    <Link
      href={`/design-systems/${ds.id}`}
      className={cn(
        "group flex flex-col gap-3.5 rounded-3xl border bg-card p-5 no-underline shadow-[0_12px_32px_-24px_rgba(28,25,23,.35)] transition-[transform,box-shadow,border-color] duration-(--duration-base) hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-24px_rgba(190,24,93,.4)]",
        ds.is_default
          ? "border-raspberry-200"
          : "border-stone-200/80 hover:border-raspberry-200",
      )}
    >
      <div className="flex h-24 items-center gap-3 rounded-2xl bg-stone-50 px-5">
        {colors.length ? (
          <Swatches colors={colors} />
        ) : (
          <Palette className="size-6 text-stone-300" aria-hidden="true" />
        )}
        <span
          className="ml-auto text-3xl font-semibold text-stone-900"
          style={font ? { fontFamily: `${font}, system-ui` } : undefined}
        >
          Aa
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="truncate text-[15px] font-semibold text-stone-900">
          {ds.name}
        </span>
        {ds.is_default && (
          <Badge className="bg-raspberry-50 text-raspberry-800">
            Team default
          </Badge>
        )}
        <span className="ml-auto">
          {ds.status === "ready" ? <KindBadge kind={ds.kind} /> : null}
        </span>
      </div>
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-stone-600">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{sourceLabel(ds)}</span>
      </p>
      {ds.status === "importing" ? (
        <div className="space-y-1.5">
          <Progress indeterminate aria-label={`Importing ${ds.name}`} />
          <p className="text-xs text-stone-600">
            {ds.progress ?? "Importing"}…
          </p>
        </div>
      ) : ds.status === "failed" ? (
        <p className="flex gap-1.5 text-xs text-red-700">
          <TriangleAlert
            className="mt-px size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="line-clamp-2">
            {ds.error ?? "The import failed."}
          </span>
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Badge>{ds.components.length} components</Badge>
          <Badge>{rules} rules</Badge>
          <Badge>
            Used in {used} prototype{used === 1 ? "" : "s"}
          </Badge>
        </div>
      )}
    </Link>
  );
}

export function Library({
  team,
  members,
  systems,
  usage,
  ruleCounts,
}: {
  team: Team;
  members: number;
  systems: DesignSystem[];
  usage: Record<string, number>;
  ruleCounts: Record<string, number>;
}) {
  const admin = team.role === "admin";
  usePollWhile(systems.some((s) => s.status === "importing"));

  return (
    <main className="mx-auto max-w-5xl px-2 pt-10">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Design systems
          </h1>
          <p className="mt-1.5 text-sm text-stone-600">
            {team.personal
              ? "Prototypes built with a design system use its components, colors and type."
              : `Shared with everyone on ${teamLabel(team)}. Prototypes built with one use its components, colors and type.`}
          </p>
        </div>
        {admin && (
          <ImportDesignSystem
            teamId={team.id}
            teamName={teamLabel(team)}
            trigger={
              <Button size="lg">
                <Plus />
                Import design system
              </Button>
            }
          />
        )}
      </div>

      {!team.personal && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-full border border-stone-200 bg-card/70 py-2 pl-4 pr-2 text-xs text-stone-700">
          <Info className="size-4 text-stone-400" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong className="font-semibold text-stone-900">
              {members} member{members === 1 ? "" : "s"}
            </strong>{" "}
            can build with these.{" "}
            {admin
              ? "Admins import, edit rules and set the team default."
              : "Admins import them; you can pick any for your prototypes and suggest rules."}
          </span>
          <Badge>{admin ? "You're an admin" : "Member"}</Badge>
          <Button asChild variant="link" size="sm">
            <Link href="/team/members">Members</Link>
          </Button>
        </div>
      )}

      {systems.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-stone-300 bg-card/50 px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-glow-soft text-raspberry-700">
            <Layers className="size-5" aria-hidden="true" />
          </span>
          <p className="text-[15px] font-semibold">
            Bring in your design system
          </p>
          <p className="max-w-md text-[13px] text-stone-600">
            From GitHub, npm, a Storybook, or files like tokens, CSS and style
            guides. Realframe reads it once and every build follows it.
          </p>
          {admin ? (
            <ImportDesignSystem
              teamId={team.id}
              teamName={teamLabel(team)}
              trigger={
                <Button variant="outline">
                  <Plus />
                  Import
                </Button>
              }
            />
          ) : (
            <p className="text-xs text-stone-500">
              Ask a team admin to import one.
            </p>
          )}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {systems.map((ds) => (
              <motion.li key={ds.id} {...listItem}>
                <Card
                  ds={ds}
                  used={usage[ds.id] ?? 0}
                  rules={ruleCounts[ds.id] ?? 0}
                />
              </motion.li>
            ))}
          </AnimatePresence>
          {admin && (
            <li>
              <ImportDesignSystem
                teamId={team.id}
                teamName={teamLabel(team)}
                trigger={
                  <button
                    type="button"
                    className="flex h-full min-h-56 w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-stone-300 bg-card/50 p-6 text-center transition-colors hover:border-raspberry-200 hover:bg-card"
                  >
                    <Boxes
                      className="size-6 text-raspberry-600"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-semibold">
                      Bring in another system
                    </span>
                    <span className="max-w-60 text-xs text-stone-600">
                      From GitHub, npm, Storybook, or files like tokens, CSS and
                      style guides.
                    </span>
                  </button>
                }
              />
            </li>
          )}
        </ul>
      )}
    </main>
  );
}
