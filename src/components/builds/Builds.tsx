"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleX, ExternalLink, GitBranch, GitCommitHorizontal, Hammer, RotateCcw, Square, SquareTerminal, Unplug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { buildNow, cancelBuild, disconnectRepo, updateSource } from "@/app/projects/github-actions";

import { BUILD_COLUMNS, type Build, type Source } from "@/lib/builds/types";
export type { Build, Source };

const active = (b: Build) => b.status === "queued" || b.status === "building";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-4", className)} fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function elapsed(b: Build, now: number) {
  const start = new Date(b.started_at ?? b.queued_at).getTime();
  const end = b.finished_at ? new Date(b.finished_at).getTime() : now;
  const s = Math.max(0, Math.round((end - start) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Keeps a project's builds fresh while any are running, and refreshes the page when one finishes. */
export function useBuilds(projectId: string, initial: Build[]) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [builds, setBuilds] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const prev = useRef(initial);

  useEffect(() => setBuilds(initial), [initial]);

  const running = builds.some(active);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from("builds")
        .select(BUILD_COLUMNS)
        .eq("project_id", projectId)
        .order("queued_at", { ascending: false })
        .limit(8);
      if (!data) return;
      const next = data as Build[];
      const finished = next.some((b) => !active(b) && prev.current.some((p) => p.id === b.id && active(p)));
      prev.current = next;
      setBuilds(next);
      if (finished) router.refresh();
    }, 2500);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [running, supabase, projectId, router]);

  return { builds, setBuilds, now };
}

export function SourceCard({
  source,
  isOwner,
  running,
  onBuilt,
}: {
  source: Source;
  isOwner: boolean;
  running: boolean;
  onBuilt: (buildId: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2.5 rounded-2xl bg-stone-50 p-3 shadow-[inset_0_0_0_1px_var(--color-border)]">
      <div className="flex items-center gap-2">
        <GitHubMark className="size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <a
            href={`https://github.com/${source.repo_full_name}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 truncate text-xs font-semibold text-foreground no-underline hover:underline"
          >
            {source.repo_full_name}
            <ExternalLink className="size-3 shrink-0 text-stone-400" aria-hidden="true" />
          </a>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <GitBranch className="size-3" aria-hidden="true" />
            {source.branch}
            {source.root_dir && <span className="font-mono">· {source.root_dir}</span>}
            {source.framework && <span>· {source.framework}</span>}
          </span>
        </div>
        <Button
          size="sm"
          className="h-7"
          loading={busy === "build"}
          disabled={running || busy !== null}
          title={running ? "A build is already running" : "Build the latest commit"}
          onClick={() => act("build", async () => onBuilt(await buildNow(source.project_id)))}
        >
          <Hammer />
          Build
        </Button>
      </div>
      {isOwner && (
        <div className="space-y-1.5 border-t border-stone-200/70 pt-2.5">
          <div className="flex items-center gap-2">
            <Switch
              id="build-on-push"
              checked={source.build_on_push}
              disabled={busy !== null}
              onCheckedChange={(v) => act("bop", () => updateSource(source.project_id, { buildOnPush: v }))}
            />
            <Label htmlFor="build-on-push" className="text-stone-700">
              Build on every push to {source.branch}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="publish-on-push"
              checked={source.publish_on_push}
              disabled={busy !== null || !source.build_on_push}
              onCheckedChange={(v) => act("pop", () => updateSource(source.project_id, { publishOnPush: v }))}
            />
            <Label htmlFor="publish-on-push" className="text-stone-700">
              Publish each successful build
            </Label>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="-ml-2 h-7 text-stone-500" disabled={busy !== null}>
                <Unplug />
                Disconnect repository
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect {source.repo_full_name}?</AlertDialogTitle>
                <AlertDialogDescription>Pushes stop building new versions. Every version already built stays.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => act("disconnect", () => disconnectRepo(source.project_id))}>Disconnect</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Running, failed and cancelled builds (finished ones show up as versions). */
export function BuildList({
  projectId,
  builds,
  now,
  onShowLog,
  onBuilt,
}: {
  projectId: string;
  builds: Build[];
  now: number;
  onShowLog: (id: string) => void;
  onBuilt: (buildId: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const shown = builds.filter((b) => b.status !== "succeeded").slice(0, 3);
  if (!shown.length) return null;

  async function act(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-1">
      {shown.map((b) => (
        <li key={b.id} className="flex gap-2.5 rounded-2xl p-3 hover:bg-foreground/[.03]">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full",
              active(b) ? "bg-blue-50 text-blue-700" : b.status === "failed" ? "bg-red-50 text-red-700" : "bg-stone-100 text-stone-500",
            )}
          >
            {active(b) ? (
              <Spinner className="size-3.5" />
            ) : b.status === "failed" ? (
              <CircleX className="size-3.5" />
            ) : (
              <Square className="size-3" />
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold">
              {b.status === "queued"
                ? "Waiting to build"
                : b.status === "building"
                  ? "Building"
                  : b.status === "failed"
                    ? "Build failed"
                    : "Build cancelled"}
              <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold tabular-nums text-stone-600">
                {elapsed(b, now)}
              </span>
            </p>
            {b.commit_sha && (
              <p className="flex items-center gap-1 text-[11px] text-stone-600">
                <GitCommitHorizontal className="size-3 text-stone-400" aria-hidden="true" />
                <code className="font-mono">{b.commit_sha.slice(0, 7)}</code>
                {b.commit_author && <span>· {b.commit_author}</span>}
              </p>
            )}
            {b.commit_message && <p className="truncate text-[11px] text-muted-foreground">“{b.commit_message}”</p>}
            {b.status === "failed" && b.error_summary && (
              <code className="mt-1 block rounded-lg bg-red-50 px-2 py-1.5 font-mono text-[10.5px] leading-snug text-red-800">
                {b.error_summary}
              </code>
            )}
            <div className="flex gap-1.5 pt-1.5">
              <Button size="sm" className="h-7" onClick={() => onShowLog(b.id)}>
                <SquareTerminal />
                View log
              </Button>
              {active(b) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  loading={busy === b.id}
                  onClick={() => act(b.id, () => cancelBuild(projectId, b.id))}
                >
                  <X />
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  loading={busy === b.id}
                  disabled={builds.some(active)}
                  onClick={() => act(b.id, async () => onBuilt(await buildNow(projectId, true)))}
                >
                  <RotateCcw />
                  Retry
                </Button>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The build log, streaming while the build runs. */
export function BuildLog({ buildId, onClose }: { buildId: string; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [build, setBuild] = useState<(Build & { log: string }) | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const { data } = await supabase.from("builds").select(`${BUILD_COLUMNS}, log`).eq("id", buildId).maybeSingle();
      if (stop) return;
      if (data) setBuild(data as Build & { log: string });
      if (!data || active(data as Build)) timer = setTimeout(load, 1500);
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [buildId, supabase]);

  useEffect(() => {
    if (stick.current) end.current?.scrollIntoView({ block: "end" });
  }, [build?.log]);

  return (
    <section aria-label="Build log" className="flex h-64 shrink-0 flex-col overflow-hidden rounded-[1.4rem] bg-stone-900 text-stone-200">
      <div className="flex items-center gap-2 border-b border-stone-800 px-3.5 py-2 text-xs">
        {build && active(build) ? (
          <Spinner className="size-3.5 text-blue-300" />
        ) : build?.status === "failed" ? (
          <CircleX className="size-3.5 text-red-400" aria-hidden="true" />
        ) : (
          <SquareTerminal className="size-3.5 text-stone-400" aria-hidden="true" />
        )}
        <strong className="font-semibold">
          {build?.status === "building"
            ? "Building"
            : build?.status === "queued"
              ? "Waiting"
              : build?.status === "failed"
                ? "Failed"
                : "Build"}{" "}
          {build?.commit_sha?.slice(0, 7)}
        </strong>
        {build?.commit_message && <span className="truncate text-stone-400">· {build.commit_message}</span>}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close log"
          className="ml-auto grid size-6 place-items-center rounded-full text-stone-400 hover:bg-white/10 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div
        ref={box}
        onScroll={() => {
          const el = box.current;
          if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 overflow-y-auto px-3.5 py-2.5"
      >
        <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed">{build?.log || "Starting…"}</pre>
        <div ref={end} />
      </div>
    </section>
  );
}
