"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CircleCheck,
  Expand,
  LogIn,
  MessageSquare,
  MessageSquarePlus,
  PencilRuler,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { Mark } from "@/components/Logo";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { AnimatePresence, listItem, motion } from "@/components/motion";
import {
  PRESENT_FRAME_CLASS,
  PresentControls,
  enterFullscreen,
} from "@/components/PresentMode";
import { PrototypeFrame, type Pin } from "@/components/PrototypeFrame";
import { createClient } from "@/lib/supabase/client";
import {
  authorLabel,
  canComment,
  type Project,
  type Role,
  type Thread,
} from "@/lib/types";
import { readSettings } from "@/lib/devices";
import {
  DevicePicker,
  DeviceStage,
  RotateButton,
  useDeviceView,
} from "@/components/devices/DeviceView";

type Version = {
  id: string;
  number: number;
  html: string;
  src?: string | null;
  summary: string | null;
  created_at: string;
};

export function Review({
  project,
  role,
  userEmail,
  version,
  threads,
  versionNumbers,
  guestName,
  present = false,
  accountMenu,
}: {
  project: Project;
  role: Role;
  userEmail: string | null;
  version: Version;
  threads: Thread[];
  versionNumbers: Record<string, number>;
  guestName?: string;
  /** Open straight into full-screen present mode (?present=1, and the home-screen web app). */
  present?: boolean;
  /** Profile menu for signed-in reviewers. */
  accountMenu?: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isGuest = role === "guest";
  const commenter =
    canComment(role) || (isGuest && project.guest_comments !== false);
  const [commentMode, setCommentMode] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [presenting, setPresenting] = useState(present);
  const deviceSettings = useMemo(
    () => readSettings(project.devices),
    [project.devices],
  );
  const view = useDeviceView(`review:${project.id}`, deviceSettings);
  const [measure, setMeasure] = useState({ percent: 100, width: 0, height: 0 });

  const ordered = useMemo(
    () => threads.map((t, i) => ({ ...t, n: i + 1 })),
    [threads],
  );
  const pins: Pin[] = ordered
    .filter(
      (t) =>
        t.version_id === version.id &&
        (filter === "all" || t.status === filter),
    )
    .map((t) => ({
      id: t.id,
      n: t.n,
      x: t.x,
      y: t.y,
      status: t.status,
      selected: t.id === selected,
    }));
  const visible = ordered
    .filter((t) => filter === "all" || t.status === filter)
    .reverse();
  const openCount = threads.filter((t) => t.status === "open").length;

  useEffect(() => {
    if (!isGuest) return;
    // Guests have no session for Realtime, so poll for new comments instead.
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [isGuest, router]);

  async function guestPost(payload: Record<string, unknown>) {
    const res = await fetch(`/api/p/${project.slug}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok
      ? { data, error: null }
      : { data: null, error: { message: data.error || "Couldn't post that." } };
  }

  useEffect(() => {
    if (role === "public" || isGuest) return;
    const channel = supabase
      .channel(`review-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `project_id=eq.${project.id}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comment_threads",
          filter: `project_id=eq.${project.id}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${project.id}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, role, router]);

  async function submitThread(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || !draftText.trim()) return;
    setBusy(true);
    setError("");
    const { data, error } = isGuest
      ? await guestPost({
          versionId: version.id,
          x: draft.x,
          y: draft.y,
          body: draftText.trim(),
        }).then((r) => ({
          data: r.data?.threadId as string | undefined,
          error: r.error,
        }))
      : await supabase.rpc("create_thread", {
          p_project: project.id,
          p_version: version.id,
          p_x: draft.x,
          p_y: draft.y,
          p_body: draftText.trim(),
        });
    setBusy(false);
    if (error) return setError(error.message);
    setDraft(null);
    setDraftText("");
    setCommentMode(false);
    setFilter("open");
    if (typeof data === "string") setSelected(data);
    router.refresh();
  }

  async function reply(threadId: string) {
    const body = (replies[threadId] ?? "").trim();
    if (!body || (!userEmail && !isGuest)) return;
    setBusy(true);
    setError("");
    if (isGuest) {
      const { error } = await guestPost({ threadId, body });
      setBusy(false);
      if (error) return setError(error.message);
      setReplies((r) => ({ ...r, [threadId]: "" }));
      router.refresh();
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("comments").insert({
      thread_id: threadId,
      project_id: project.id,
      author_id: user?.id,
      author_email: userEmail,
      body,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setReplies((r) => ({ ...r, [threadId]: "" }));
    router.refresh();
  }

  async function toggleResolved(t: Thread) {
    setError("");
    const { error } = await supabase
      .from("comment_threads")
      .update({
        status: t.status === "open" ? "resolved" : "open",
        resolved_at: t.status === "open" ? new Date().toISOString() : null,
      })
      .eq("id", t.id);
    if (error) setError(error.message);
    router.refresh();
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="glass mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5">
        <Link
          href={userEmail ? "/projects" : "/"}
          aria-label="Realframe"
          className="rounded-full p-1 hover:bg-foreground/5"
        >
          <Mark size={26} />
        </Link>
        <h1 className="min-w-0 truncate text-sm font-semibold">
          {project.name}
        </h1>
        {project.live_version_id === version.id ? (
          <Badge variant="success">
            <BadgeDot />v{version.number} · Live
          </Badge>
        ) : (
          <Badge>v{version.number} · Draft</Badge>
        )}
        <div className="flex-1" />
        {view.list.length > 1 && <DevicePicker view={view} measure={measure} />}
        <RotateButton view={view} />
        <Button
          variant="ghost"
          title="Show the prototype full screen"
          onClick={() => {
            enterFullscreen();
            setCommentMode(false);
            setDraft(null);
            setPresenting(true);
          }}
        >
          <Expand />
          Full screen
        </Button>
        {(role === "owner" || role === "editor") && (
          <Button asChild variant="ghost">
            <a href={`/projects/${project.id}`}>
              <PencilRuler />
              Open in studio
            </a>
          </Button>
        )}
        {commenter && (
          <Button
            variant={commentMode ? "default" : "outline"}
            aria-pressed={commentMode}
            onClick={() => {
              setCommentMode((m) => !m);
              setDraft(null);
            }}
          >
            {commentMode ? <X /> : <MessageSquarePlus />}
            {commentMode ? "Click to pin · Esc to cancel" : "Add comment"}
          </Button>
        )}
        {isGuest ? (
          <span className="px-2 text-xs text-muted-foreground">
            Viewing as {guestName}
          </span>
        ) : userEmail ? (
          accountMenu
        ) : (
          <Button asChild variant="ghost">
            <a href={`/?next=/p/${project.slug}`}>
              <LogIn />
              Sign in
            </a>
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <main
          className="relative min-w-0 flex-1 overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/40 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setCommentMode(false);
              setDraft(null);
            }
          }}
        >
          {presenting && (
            <PresentControls
              onExit={() => {
                setPresenting(false);
                if (present)
                  window.history.replaceState(
                    null,
                    "",
                    window.location.pathname,
                  );
              }}
            />
          )}
          <div
            role={presenting ? "dialog" : undefined}
            aria-label={presenting ? `${project.name}, full screen` : undefined}
            className={cn(
              "flex h-full flex-col",
              presenting && PRESENT_FRAME_CLASS,
            )}
          >
            <DeviceStage
              view={view}
              presenting={presenting}
              onMeasure={setMeasure}
            >
              <PrototypeFrame
                html={version.html}
                src={version.src}
                title={`${project.name} v${version.number}`}
                commentMode={commentMode}
                pins={pins}
                onPick={(x, y) => {
                  setDraft({ x, y });
                  setCommentMode(false);
                }}
                onSelectPin={(id) => setSelected(id)}
              />
            </DeviceStage>
          </div>
          {draft && (
            <form
              onSubmit={submitThread}
              className="absolute bottom-8 left-1/2 w-[min(420px,90%)] -translate-x-1/2 space-y-2.5 rounded-3xl border border-border bg-card p-3.5 shadow-[0_30px_70px_-30px_rgba(28,25,23,.45)]"
            >
              <Label
                htmlFor="newc"
                className="text-[13px] font-semibold text-foreground"
              >
                New comment on v{version.number}
              </Label>
              <Textarea
                id="newc"
                autoFocus
                rows={3}
                maxLength={5000}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                    submitThread(e);
                }}
                placeholder="What should change here?"
                className="field-sizing-fixed resize-none"
              />
              <div className="flex items-center justify-end gap-1.5">
                <Kbd className="mr-auto">⌘↵</Kbd>
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  loading={busy}
                  disabled={!draftText.trim()}
                >
                  <Send />
                  Post
                </Button>
              </div>
            </form>
          )}
        </main>

        {role !== "public" && (
          <aside
            aria-label="Comments"
            className="glass flex w-[340px] shrink-0 flex-col overflow-hidden rounded-[1.75rem]"
          >
            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2.5">
              <MessageSquare
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="text-[13px] font-semibold">Comments</h2>
              <span className="text-xs text-muted-foreground">
                {openCount} open
              </span>
              <ToggleGroup
                type="single"
                aria-label="Filter comments"
                value={filter}
                onValueChange={(v) => v && setFilter(v as typeof filter)}
                className="ml-auto"
              >
                <ToggleGroupItem value="open">Open</ToggleGroupItem>
                <ToggleGroupItem value="resolved">Resolved</ToggleGroupItem>
                <ToggleGroupItem value="all">All</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {error && (
              <p
                role="alert"
                className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-800"
              >
                {error}
              </p>
            )}
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {visible.length === 0 && (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-[13px] text-muted-foreground">
                  <MessageSquare
                    className="size-5 text-stone-400"
                    aria-hidden="true"
                  />
                  {commenter
                    ? "No comments here yet. Click “Add comment”, then click anywhere on the prototype."
                    : "No comments yet."}
                </div>
              )}
              <AnimatePresence initial={false}>
                {visible.map((t) => (
                  <motion.article
                    key={t.id}
                    {...listItem}
                    onClick={() => setSelected(t.id)}
                    className={cn(
                      "cursor-default space-y-2 rounded-2xl p-3 transition-colors",
                      t.id === selected
                        ? "bg-glow-soft shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]"
                        : "hover:bg-foreground/[.03]",
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-xs">
                      <span
                        className={cn(
                          "grid size-5 place-items-center rounded-full text-[10px] font-bold text-white",
                          t.status === "open" ? "btn-glow" : "bg-stone-400",
                        )}
                      >
                        {t.n}
                      </span>
                      <Badge>v{versionNumbers[t.version_id] ?? "?"}</Badge>
                      {t.version_id !== version.id && (
                        <span className="text-muted-foreground">
                          earlier version
                        </span>
                      )}
                      {commenter && !isGuest && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleResolved(t);
                          }}
                        >
                          {t.status === "open" ? <CircleCheck /> : <Undo2 />}
                          {t.status === "open" ? "Resolve" : "Reopen"}
                        </Button>
                      )}
                    </div>
                    {t.comments
                      .slice()
                      .sort((a, b) => a.created_at.localeCompare(b.created_at))
                      .map((c) => (
                        <div key={c.id} className="text-[13px] leading-relaxed">
                          <span className="font-semibold">
                            {authorLabel(c)}
                          </span>{" "}
                          <span
                            suppressHydrationWarning
                            className="text-[11px] text-muted-foreground"
                          >
                            {new Date(c.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                          <p className="whitespace-pre-wrap">{c.body}</p>
                        </div>
                      ))}
                    {commenter && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          reply(t.id);
                        }}
                        className="flex gap-1.5"
                      >
                        <label htmlFor={`r-${t.id}`} className="sr-only">
                          Reply
                        </label>
                        <Input
                          id={`r-${t.id}`}
                          value={replies[t.id] ?? ""}
                          onChange={(e) =>
                            setReplies((r) => ({
                              ...r,
                              [t.id]: e.target.value,
                            }))
                          }
                          placeholder="Reply…"
                          className="h-8 text-xs"
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="icon-sm"
                          aria-label="Send reply"
                          title="Send reply"
                          disabled={busy || !(replies[t.id] ?? "").trim()}
                        >
                          <Send />
                        </Button>
                      </form>
                    )}
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
            {!commenter && (
              <p className="border-t border-stone-100 p-3 text-xs text-muted-foreground">
                You have view access. Ask the owner for comment access.
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
