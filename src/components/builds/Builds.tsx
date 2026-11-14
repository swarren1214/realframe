"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleX,
  ExternalLink,
  Folder,
  GitBranch,
  GitCommitHorizontal,
  Hammer,
  RotateCcw,
  Settings2,
  Square,
  SquareTerminal,
  Unplug,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SwitchRow } from "@/components/ui/switch-row";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { notify } from "@/lib/toast";
import {
  buildNow as raw_buildNow,
  cancelBuild as raw_cancelBuild,
  disconnectRepo as raw_disconnectRepo,
  updateSource as raw_updateSource,
} from "@/app/projects/github-actions";

import { BUILD_COLUMNS, type Build, type Source } from "@/lib/builds/types";
import { unwrapped } from "@/lib/safe-action";

const buildNow = unwrapped(raw_buildNow);
const cancelBuild = unwrapped(raw_cancelBuild);
const disconnectRepo = unwrapped(raw_disconnectRepo);
const updateSource = unwrapped(raw_updateSource);
export type { Build, Source };

const active = (b: Build) => b.status === "queued" || b.status === "building";

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-4", className)}
      fill="currentColor"
    >
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
      const done = next.filter(
        (b) =>
          !active(b) && prev.current.some((p) => p.id === b.id && active(p)),
      );
      const finished = done.length > 0;
      for (const b of done) {
        const sha =
          b.commit_sha && b.commit_sha !== "upload"
            ? b.commit_sha.slice(0, 7)
            : null;
        if (b.status === "succeeded")
          notify.success(sha ? `Built ${sha}` : "Build finished", {
            description:
              b.trigger === "push"
                ? "Published to the review link."
                : undefined,
          });
        else if (b.status === "failed")
          notify.error(sha ? `Build ${sha} failed` : "Build failed", {
            description: b.error_summary ?? undefined,
          });
      }
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

/** Shortens long names in the middle so both ends stay readable: ticket-sp…react. */
export function middleTruncate(text: string, max = 22) {
  if (text.length <= max) return text;
  const keep = max - 1;
  return `${text.slice(0, Math.ceil(keep / 2))}…${text.slice(text.length - Math.floor(keep / 2))}`;
}

function Chip({
  children,
  title,
  mono,
}: {
  children: React.ReactNode;
  title?: string;
  mono?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-card px-2 text-[11px] text-stone-700 shadow-[inset_0_0_0_1px_var(--color-border)] [&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:text-stone-400",
        mono && "font-mono",
      )}
    >
      {children}
    </span>
  );
}

function timeAgo(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function SourceCard({
  source,
  isOwner,
  running,
  latest,
  now,
  onBuilt,
}: {
  source: Source;
  isOwner: boolean;
  running: boolean;
  latest?: Build;
  now: number;
  onBuilt: (buildId: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // Switches update at once and roll back if saving fails.
  const [buildOnPush, setBuildOnPush] = useState(source.build_on_push);
  const [publishOnPush, setPublishOnPush] = useState(source.publish_on_push);
  useEffect(() => {
    setBuildOnPush(source.build_on_push);
    setPublishOnPush(source.publish_on_push);
  }, [source.build_on_push, source.publish_on_push]);

  async function act(
    key: string,
    fn: () => Promise<unknown>,
    rollback?: () => void,
    success?: string,
  ) {
    setBusy(key);
    try {
      await fn();
      router.refresh();
      if (success) notify.success(success);
    } catch (e) {
      rollback?.();
      notify.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const status = running
    ? "Building…"
    : latest?.status === "succeeded" && latest.commit_sha
      ? `Built ${latest.commit_sha.slice(0, 7)} · ${timeAgo(latest.finished_at ?? latest.queued_at, now)}`
      : latest?.status === "failed"
        ? `Last build failed · ${timeAgo(latest.finished_at ?? latest.queued_at, now)}`
        : latest?.status === "succeeded"
          ? `Built · ${timeAgo(latest.finished_at ?? latest.queued_at, now)}`
          : "Not built yet";

  return (
    <section
      aria-label="Repository"
      className="rounded-2xl bg-stone-50/80 shadow-[inset_0_0_0_1px_var(--color-border)]"
    >
      <div className="space-y-2.5 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <GitHubMark className="size-4 shrink-0" />
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-semibold"
            title={source.repo_full_name}
          >
            {source.repo_full_name}
          </span>
          <Button
            asChild
            variant="ghost"
            size="icon-sm"
            className="size-7 text-stone-500"
            aria-label="Open on GitHub"
            title="Open on GitHub"
          >
            <a
              href={`https://github.com/${source.repo_full_name}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink />
            </a>
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip title={`Branch: ${source.branch}`}>
            <GitBranch />
            <span className="truncate">{source.branch}</span>
          </Chip>
          {source.root_dir && (
            <Chip title={`App folder: ${source.root_dir}`} mono>
              <Folder />
              {middleTruncate(source.root_dir)}
            </Chip>
          )}
          {source.framework && (
            <Chip title="Detected framework">{source.framework}</Chip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            suppressHydrationWarning
            className={cn(
              "min-w-0 flex-1 truncate text-[11px]",
              latest?.status === "failed" && !running
                ? "text-red-700"
                : "text-muted-foreground",
            )}
          >
            {running && <Spinner className="mr-1 inline size-3 align-[-2px]" />}
            {status}
          </span>
          <Button
            size="sm"
            loading={busy === "build"}
            disabled={running || busy !== null}
            title={
              running ? "A build is already running" : "Build the latest commit"
            }
            onClick={() =>
              act(
                "build",
                async () => onBuilt(await buildNow(source.project_id)),
                undefined,
                "Building the latest commit",
              )
            }
          >
            <Hammer />
            Build
          </Button>
        </div>
      </div>

      {isOwner && (
        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center gap-1.5 border-t border-stone-200/70 px-3 py-2 text-left text-xs font-medium text-stone-600 outline-none transition-colors hover:text-foreground focus-visible:bg-foreground/[.03]">
            <Settings2 className="size-3.5" aria-hidden="true" />
            Settings
            <ChevronDown
              className="ml-auto size-3.5 transition-transform duration-[var(--duration-base)] group-data-[state=open]:rotate-180"
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-0.5 px-1 pb-2">
              <SwitchRow
                id="build-on-push"
                label={`Build every push to ${source.branch}`}
                checked={buildOnPush}
                loading={busy === "bop"}
                disabled={busy !== null && busy !== "bop"}
                onCheckedChange={(v) => {
                  setBuildOnPush(v);
                  act(
                    "bop",
                    () => updateSource(source.project_id, { buildOnPush: v }),
                    () => setBuildOnPush(!v),
                  );
                }}
              />
              <SwitchRow
                id="publish-on-push"
                label="Publish each successful build"
                description="The review link always shows the latest push."
                checked={publishOnPush}
                loading={busy === "pop"}
                disabled={!buildOnPush || (busy !== null && busy !== "pop")}
                onCheckedChange={(v) => {
                  setPublishOnPush(v);
                  act(
                    "pop",
                    () => updateSource(source.project_id, { publishOnPush: v }),
                    () => setPublishOnPush(!v),
                  );
                }}
              />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="ml-1 mt-1"
                    disabled={busy !== null}
                  >
                    <Unplug />
                    Disconnect repository
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Disconnect {source.repo_full_name}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Pushes stop building new versions. Every version already
                      built stays.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        act(
                          "disconnect",
                          () => disconnectRepo(source.project_id),
                          undefined,
                          `Disconnected ${source.repo_full_name}`,
                        )
                      }
                    >
                      Disconnect
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
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

  async function act(
    key: string,
    fn: () => Promise<unknown>,
    success?: string,
  ) {
    setBusy(key);
    try {
      await fn();
      router.refresh();
      if (success) notify.success(success);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="space-y-1">
      {shown.map((b) => (
        <li
          key={b.id}
          className="flex gap-2.5 rounded-2xl p-3 hover:bg-foreground/[.03]"
        >
          <span
            aria-hidden="true"
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full",
              active(b)
                ? "bg-blue-50 text-blue-700"
                : b.status === "failed"
                  ? "bg-red-50 text-red-700"
                  : "bg-stone-100 text-stone-500",
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
                <GitCommitHorizontal
                  className="size-3 text-stone-400"
                  aria-hidden="true"
                />
                <code className="font-mono">{b.commit_sha.slice(0, 7)}</code>
                {b.commit_author && <span>· {b.commit_author}</span>}
              </p>
            )}
            {b.commit_message && (
              <p className="truncate text-[11px] text-muted-foreground">
                “{b.commit_message}”
              </p>
            )}
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
                  onClick={() =>
                    act(
                      b.id,
                      () => cancelBuild(projectId, b.id),
                      "Build cancelled",
                    )
                  }
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
                  onClick={() =>
                    act(
                      b.id,
                      async () => onBuilt(await buildNow(projectId, true)),
                      "Building again",
                    )
                  }
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
export function BuildLog({
  buildId,
  onClose,
}: {
  buildId: string;
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [build, setBuild] = useState<(Build & { log: string }) | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const { data } = await supabase
        .from("builds")
        .select(`${BUILD_COLUMNS}, log`)
        .eq("id", buildId)
        .maybeSingle();
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
    <section
      aria-label="Build log"
      className="rf-light-palette flex h-64 shrink-0 flex-col overflow-hidden rounded-[1.4rem] bg-stone-900 text-stone-200"
    >
      <div className="flex items-center gap-2 border-b border-stone-800 px-3.5 py-2 text-xs">
        {build && active(build) ? (
          <Spinner className="size-3.5 text-blue-300" />
        ) : build?.status === "failed" ? (
          <CircleX className="size-3.5 text-red-400" aria-hidden="true" />
        ) : (
          <SquareTerminal
            className="size-3.5 text-stone-400"
            aria-hidden="true"
          />
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
        {build?.commit_message && (
          <span className="truncate text-stone-400">
            · {build.commit_message}
          </span>
        )}
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
          if (el)
            stick.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 overflow-y-auto px-3.5 py-2.5"
      >
        <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed">
          {build?.log || "Starting…"}
        </pre>
        <div ref={end} />
      </div>
    </section>
  );
}
