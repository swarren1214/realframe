"use client";
import {
  Columns2,
  FileDown,
  GitCommitHorizontal,
  Check,
  Layers,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listItem, motion } from "@/components/motion";
import { PrototypeFrame } from "@/components/PrototypeFrame";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type Variant, type VersionMeta } from "@/lib/types";

export function VariantCompare({
  variants,
  busyKey,
  onKeep,
  onDiscard,
}: {
  variants: Variant[];
  busyKey: string | null;
  onKeep: (v: Variant) => void;
  onDiscard: () => void;
}) {
  const anyBusy = busyKey !== null;
  return (
    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-card/80 bg-card/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles
              className="size-4 text-raspberry-700"
              aria-hidden="true"
            />
            Compare {variants.length} variants
          </h2>
          <p className="truncate text-xs text-stone-600">
            “{variants[0].prompt}” · Keep one to make it the next version.
          </p>
        </div>
        <Button
          loading={busyKey === "discard"}
          disabled={anyBusy}
          onClick={onDiscard}
        >
          <X />
          Discard all
        </Button>
      </div>
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-3",
          variants.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2",
        )}
      >
        {variants.map((v) => (
          <section
            key={v.id}
            aria-label={`Variant ${v.position}`}
            className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-stone-200 bg-card shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]"
          >
            <div className="flex items-start gap-3 border-b border-stone-100 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">
                  Variant {v.position}
                </p>
                {v.summary && (
                  <p className="line-clamp-2 text-xs text-stone-600">
                    {v.summary}
                  </p>
                )}
              </div>
              <Button
                variant="default"
                size="sm"
                loading={busyKey === `keep-${v.id}`}
                disabled={anyBusy}
                onClick={() => onKeep(v)}
              >
                <Check />
                Keep
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <PrototypeFrame html={v.html} title={`Variant ${v.position}`} />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  restore: "Restore",
  edit: "Visual edit",
  variant: "Variant",
  import: "Import",
  github: "GitHub",
};

export function versionTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function VersionItem({
  version: v,
  selected,
  live,
  canRestore,
  restoring,
  disabled,
  onSelect,
  onRestore,
  onCompare,
  onExport,
  designSystem,
}: {
  /** The design system this version was built with, if any. */
  designSystem?: string;
  version: VersionMeta;
  selected: boolean;
  live: boolean;
  canRestore: boolean;
  restoring: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRestore: () => void;
  onCompare?: () => void;
  onExport?: () => void;
}) {
  const summary = v.summary ?? "";
  const long = summary.length > 90;
  const body = (
    <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-700">
      {summary}
    </span>
  );
  return (
    <motion.li
      {...listItem}
      className={cn(
        "rounded-2xl transition-colors duration-[var(--duration-fast)]",
        selected
          ? "bg-glow-soft shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]"
          : "hover:bg-foreground/[.03]",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className="block w-full rounded-2xl p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold">v{v.number}</span>
          {live && (
            <Badge variant="success">
              <BadgeDot />
              Live
            </Badge>
          )}
          {v.source !== "ai" && (
            <Badge>{SOURCE_LABEL[v.source] ?? v.source}</Badge>
          )}
          {designSystem && (
            <Badge
              className="max-w-28 bg-blue-50 text-blue-800"
              title={`Built with ${designSystem}`}
            >
              <Layers />
              <span className="truncate">{designSystem}</span>
            </Badge>
          )}
          <span
            suppressHydrationWarning
            className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground"
          >
            {versionTime(v.created_at)}
          </span>
        </span>
        {summary &&
          (long ? (
            <Tooltip>
              <TooltipTrigger asChild>{body}</TooltipTrigger>
              <TooltipContent side="left">{summary}</TooltipContent>
            </Tooltip>
          ) : (
            body
          ))}
        {v.commit_sha ? (
          <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <GitCommitHorizontal className="size-3" aria-hidden="true" />
            <code className="font-mono">{v.commit_sha.slice(0, 7)}</code>
            {v.commit_author && (
              <span className="truncate">· {v.commit_author}</span>
            )}
          </span>
        ) : (
          v.prompt && (
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">
              “{v.prompt}”
            </span>
          )
        )}
      </button>
      {selected && (canRestore || onCompare || onExport) && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3">
          {onCompare && (
            <Button size="sm" variant="outline" onClick={onCompare}>
              <Columns2 />
              Compare
            </Button>
          )}
          {onExport && (
            <Button size="sm" variant="outline" onClick={onExport}>
              <FileDown />
              Export
            </Button>
          )}
          {canRestore && (
            <Button
              size="sm"
              loading={restoring}
              disabled={disabled}
              onClick={onRestore}
            >
              <RotateCcw />
              Restore as new version
            </Button>
          )}
        </div>
      )}
    </motion.li>
  );
}
