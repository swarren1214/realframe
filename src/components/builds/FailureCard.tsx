"use client";
import { CircleAlert, CircleCheck, Pencil, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { describeFailure } from "@/lib/failures";

/**
 * A failed build in the chat: what happened in plain words, and what to do next.
 * Actions show only on the latest failure; older ones read as history.
 */
export function FailureCard({
  content,
  prompt,
  latest,
  busy,
  onRetry,
  onEdit,
}: {
  content: string;
  /** The request that failed, if we can find it. */
  prompt: string | null;
  latest: boolean;
  busy: boolean;
  onRetry: (opts: { smaller: boolean }) => void;
  onEdit: () => void;
}) {
  const f = describeFailure(content);
  return (
    <div className="space-y-1.5">
      <div
        role={latest ? "alert" : undefined}
        className="rounded-2xl border border-red-200 bg-red-50 p-3"
      >
        <p className="flex items-start gap-2 text-[13px] font-semibold text-red-900">
          <CircleAlert
            className="mt-0.5 size-4 shrink-0 text-red-600"
            aria-hidden="true"
          />
          {f.title}
        </p>
        <p className="mt-1 pl-6 text-xs leading-relaxed text-red-800/90">
          {f.detail}
        </p>
        {latest && (
          <div className="mt-2.5 flex flex-wrap gap-2 pl-6">
            {f.kind === "limit" ? (
              <Button asChild size="sm">
                <Link href="/billing">See plans</Link>
              </Button>
            ) : (
              <>
                {f.retry && prompt && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onRetry({ smaller: f.smaller })}
                  >
                    <RotateCcw />
                    {f.smaller ? "Retry in steps" : "Retry"}
                  </Button>
                )}
                {prompt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={onEdit}
                  >
                    <Pencil />
                    Edit prompt
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {f.kind !== "limit" && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
          <CircleCheck className="size-3" aria-hidden="true" />
          Didn&apos;t count toward your builds
        </p>
      )}
    </div>
  );
}
