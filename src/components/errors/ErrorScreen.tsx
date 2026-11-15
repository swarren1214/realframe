"use client";
import { useEffect, useRef } from "react";
import { House, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Sends what happened to /api/errors once, so it's on record even if nobody reports it. */
export function useReportError(error: unknown) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const e = error as { message?: string; digest?: string; stack?: string };
    void fetch("/api/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: e?.message ?? String(error),
        digest: e?.digest,
        path: window.location.pathname + window.location.search,
        stack: e?.stack,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);
}

/** The page shown when part of the app fails to load: what happened, and two ways out. */
export default function ErrorScreen({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useReportError(error);
  const digest = (error as { digest?: string } | null)?.digest;
  return (
    <main className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-red-50 text-red-700">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1.5">
        <h1 className="font-display text-xl font-bold tracking-tight">
          Something went wrong
        </h1>
        <p className="max-w-sm text-sm text-stone-600">
          This part of Realframe didn&apos;t load. We&apos;ve logged it. Try
          again, and if it keeps happening, let us know
          {digest ? (
            <>
              {" "}
              and mention{" "}
              <code className="rounded bg-stone-100 px-1 text-xs">
                {digest}
              </code>
            </>
          ) : null}
          .
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="default" onClick={() => retry()}>
          <RotateCw />
          Try again
        </Button>
        <Button asChild variant="outline">
          <a href="/projects">
            <House />
            Your prototypes
          </a>
        </Button>
      </div>
    </main>
  );
}
