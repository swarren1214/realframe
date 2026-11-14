"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import { closeReviewRound as raw_close } from "@/app/projects/review-actions";
import type { ReviewRound } from "@/lib/types";
import { DECISION_LABEL } from "./RoundBanner";

const closeReviewRound = unwrapped(raw_close);

const STATUS: Record<ReviewRound["status"], { label: string; cls: string }> = {
  open: { label: "In review", cls: "bg-raspberry-50 text-raspberry-800" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-800" },
  changes_requested: {
    label: "Changes requested",
    cls: "bg-ember-50 text-ember-800",
  },
};

/** The open review round, for builders in the Studio. */
export function RoundCard({
  round,
  projectId,
  canClose,
}: {
  round: ReviewRound;
  projectId: string;
  canClose: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const approved = round.requests.filter(
    (r) => r.decision === "approved",
  ).length;
  const pct = Math.round((approved / Math.max(1, round.requests.length)) * 100);
  const s = STATUS[round.status];
  return (
    <section
      aria-label="Review round"
      className="space-y-2.5 rounded-2xl border border-stone-200 p-3"
    >
      <div className="flex items-center gap-2">
        <p className="flex-1 text-[13px] font-semibold">
          Review round · v{round.version_number}
        </p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
            s.cls,
          )}
        >
          {s.label}
        </span>
        {canClose && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Close this review round"
            title="Close this review round"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await closeReviewRound(round.id, projectId);
                notify.success("Review round closed");
                router.refresh();
              } catch (e) {
                notify.error(
                  e instanceof Error ? e.message : "That didn't work.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <X />
          </Button>
        )}
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-stone-100"
        role="progressbar"
        aria-label={`${approved} of ${round.requests.length} approved`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-emerald-600"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-1">
        {round.requests.map((r) => (
          <li key={r.email} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{r.name ?? r.email}</span>
            <span
              className={cn(
                "font-medium",
                r.decision === "approved"
                  ? "text-emerald-700"
                  : r.decision === "changes_requested"
                    ? "text-ember-700"
                    : "text-stone-500",
              )}
            >
              {DECISION_LABEL[r.decision]}
            </span>
          </li>
        ))}
      </ul>
      {round.due_at && (
        <p className="text-[11px] text-stone-500" suppressHydrationWarning>
          Due{" "}
          {new Date(round.due_at).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
          {round.rule === "any"
            ? " · anyone can approve"
            : " · everyone approves"}
        </p>
      )}
    </section>
  );
}
