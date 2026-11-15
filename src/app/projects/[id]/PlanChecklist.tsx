"use client";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type PlanProgress = {
  title: string;
  status: "pending" | "running" | "done" | "failed";
  summary?: string;
  /** Characters written so far while the step builds. */
  chars?: number;
};

const formatKb = (chars: number) =>
  chars < 1024 ? `${chars} characters` : `${Math.round(chars / 1024)} KB`;

/** Live checklist for a planned build: each step's state and progress, and a way to stop. */
export function PlanChecklist({
  steps,
  elapsed,
  stopping,
  onStop,
}: {
  steps: PlanProgress[];
  elapsed: number;
  stopping: boolean;
  onStop: () => void;
}) {
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2.5 rounded-2xl bg-glow-soft p-3 text-[13px] text-raspberry-800"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          Step {Math.min(done + 1, steps.length)} of {steps.length} · {elapsed}s
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onStop}
          disabled={stopping}
          className="h-7 px-2 text-xs"
        >
          {stopping ? "Stopping…" : "Stop"}
        </Button>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {s.status === "done" ? (
                <Check
                  className="size-4 text-raspberry-700"
                  aria-hidden="true"
                />
              ) : s.status === "running" ? (
                <Spinner className="size-3.5" />
              ) : s.status === "failed" ? (
                <X className="size-4 text-red-700" aria-hidden="true" />
              ) : (
                <span
                  className="size-2 rounded-full border border-raspberry-800/40"
                  aria-hidden="true"
                />
              )}
            </span>
            <span
              className={cn(
                "leading-snug",
                s.status === "pending" && "text-raspberry-800/60",
              )}
            >
              {s.title}
              {s.status === "running" && s.chars ? (
                <span className="block text-xs text-raspberry-800/70">
                  Writing · {formatKb(s.chars)}
                </span>
              ) : null}
              {s.summary && (
                <span className="block text-xs text-raspberry-800/70">
                  {s.summary}
                </span>
              )}
              <span className="sr-only">
                {s.status === "done"
                  ? " (done)"
                  : s.status === "running"
                    ? " (in progress)"
                    : s.status === "failed"
                      ? " (failed)"
                      : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
