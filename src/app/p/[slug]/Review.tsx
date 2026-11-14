"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PrototypeFrame, type Pin } from "@/components/PrototypeFrame";
import { createClient } from "@/lib/supabase/client";
import { authorLabel, canComment, type Project, type Role, type Thread } from "@/lib/types";

type Version = { id: string; number: number; html: string; summary: string | null; created_at: string };

export function Review({
  project,
  role,
  userEmail,
  version,
  threads,
  versionNumbers,
  guestName,
}: {
  project: Project;
  role: Role;
  userEmail: string | null;
  version: Version;
  threads: Thread[];
  versionNumbers: Record<string, number>;
  guestName?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isGuest = role === "guest";
  const commenter = canComment(role) || (isGuest && project.guest_comments !== false);
  const [commentMode, setCommentMode] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ordered = useMemo(() => threads.map((t, i) => ({ ...t, n: i + 1 })), [threads]);
  const pins: Pin[] = ordered
    .filter((t) => t.version_id === version.id && (filter === "all" || t.status === filter))
    .map((t) => ({ id: t.id, n: t.n, x: t.x, y: t.y, status: t.status, selected: t.id === selected }));
  const visible = ordered.filter((t) => filter === "all" || t.status === filter).reverse();
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
    return res.ok ? { data, error: null } : { data: null, error: { message: data.error || "Couldn't post that." } };
  }

  useEffect(() => {
    if (role === "public" || isGuest) return;
    const channel = supabase
      .channel(`review-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `project_id=eq.${project.id}` }, () =>
        router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comment_threads", filter: `project_id=eq.${project.id}` },
        () => router.refresh(),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "projects", filter: `id=eq.${project.id}` }, () =>
        router.refresh(),
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
      ? await guestPost({ versionId: version.id, x: draft.x, y: draft.y, body: draftText.trim() }).then((r) => ({
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
      .update({ status: t.status === "open" ? "resolved" : "open", resolved_at: t.status === "open" ? new Date().toISOString() : null })
      .eq("id", t.id);
    if (error) setError(error.message);
    router.refresh();
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-5 py-2.5">
        <Logo href={userEmail ? "/projects" : "/"} />
        <span className="text-stone-300" aria-hidden="true">
          /
        </span>
        <h1 className="font-semibold">{project.name}</h1>
        <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700">
          v{version.number}
          {project.live_version_id === version.id ? " · Live" : " · Draft"}
        </span>
        <div className="flex-1" />
        {(role === "owner" || role === "editor") && (
          <a
            href={`/projects/${project.id}`}
            className="inline-flex min-h-9 items-center rounded-lg border border-stone-200 px-3 text-sm font-medium text-stone-900 no-underline hover:bg-stone-50"
          >
            Open in studio
          </a>
        )}
        {commenter && (
          <button
            type="button"
            aria-pressed={commentMode}
            onClick={() => {
              setCommentMode((m) => !m);
              setDraft(null);
            }}
            className={`min-h-9 rounded-lg px-4 text-sm font-semibold ${
              commentMode ? "bg-ember-700 text-white" : "border border-stone-200 text-stone-900 hover:bg-stone-50"
            }`}
          >
            {commentMode ? "Click the prototype to pin… (Esc)" : "Add comment"}
          </button>
        )}
        {isGuest ? (
          <span className="text-sm text-stone-600">Viewing as {guestName}</span>
        ) : userEmail ? (
          <form action="/auth/signout" method="post">
            <button className="text-sm text-stone-600 hover:underline" title={userEmail}>
              Sign out
            </button>
          </form>
        ) : (
          <a href={`/?next=/p/${project.slug}`} className="text-sm font-semibold">
            Sign in
          </a>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <main
          className="relative min-w-0 flex-1 bg-stone-100 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setCommentMode(false);
              setDraft(null);
            }
          }}
        >
          <div className="h-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <PrototypeFrame
              html={version.html}
              title={`${project.name} v${version.number}`}
              commentMode={commentMode}
              pins={pins}
              onPick={(x, y) => {
                setDraft({ x, y });
                setCommentMode(false);
              }}
              onSelectPin={(id) => setSelected(id)}
            />
          </div>
          {draft && (
            <form
              onSubmit={submitThread}
              className="absolute bottom-8 left-1/2 w-[min(440px,90%)] -translate-x-1/2 space-y-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl"
            >
              <label htmlFor="newc" className="block text-sm font-semibold">
                New comment on v{version.number}
              </label>
              <textarea
                id="newc"
                autoFocus
                rows={3}
                maxLength={5000}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitThread(e);
                }}
                placeholder="What should change here?"
                className="w-full resize-none rounded-xl border border-stone-300 p-3 text-sm outline-none focus:border-ember-700"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="min-h-9 rounded-lg border border-stone-200 px-3 text-sm font-medium hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  disabled={busy || !draftText.trim()}
                  className="min-h-9 rounded-lg bg-ember-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Post
                </button>
              </div>
            </form>
          )}
        </main>

        {role !== "public" && (
          <aside aria-label="Comments" className="flex w-[360px] shrink-0 flex-col border-l border-stone-200 bg-white">
            <div className="flex items-center gap-2 border-b border-stone-100 p-3">
              <h2 className="font-semibold">Comments</h2>
              <span className="text-sm text-stone-500">{openCount} open</span>
              <label htmlFor="filter" className="sr-only">
                Filter
              </label>
              <select
                id="filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="ml-auto min-h-8 rounded-md border border-stone-200 bg-white px-2 text-sm"
              >
                <option value="open">Open</option>
                <option value="resolved">Resolved</option>
                <option value="all">All</option>
              </select>
            </div>
            {error && (
              <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <div className="flex-1 overflow-y-auto">
              {visible.length === 0 && (
                <p className="p-5 text-sm text-stone-500">
                  {commenter ? "No comments here yet. Click “Add comment”, then click anywhere on the prototype." : "No comments yet."}
                </p>
              )}
              {visible.map((t) => (
                <article
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`space-y-2 border-b border-stone-100 px-4 py-3 ${t.id === selected ? "bg-ember-50" : ""}`}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full font-bold text-white ${
                        t.status === "open" ? "bg-ember-700" : "bg-stone-500"
                      }`}
                    >
                      {t.n}
                    </span>
                    <span className="rounded bg-stone-100 px-1.5 font-semibold text-stone-700">v{versionNumbers[t.version_id] ?? "?"}</span>
                    {t.version_id !== version.id && <span className="text-stone-500">earlier version</span>}
                    {commenter && !isGuest && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleResolved(t);
                        }}
                        className="ml-auto rounded border border-stone-200 px-2 py-0.5 font-medium hover:bg-stone-50"
                      >
                        {t.status === "open" ? "Resolve" : "Reopen"}
                      </button>
                    )}
                  </div>
                  {t.comments
                    .slice()
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((c) => (
                      <div key={c.id} className="text-sm leading-relaxed">
                        <span className="font-semibold">{authorLabel(c)}</span>{" "}
                        <span className="text-xs text-stone-500">
                          {new Date(c.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
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
                      className="flex gap-2"
                    >
                      <label htmlFor={`r-${t.id}`} className="sr-only">
                        Reply
                      </label>
                      <input
                        id={`r-${t.id}`}
                        value={replies[t.id] ?? ""}
                        onChange={(e) => setReplies((r) => ({ ...r, [t.id]: e.target.value }))}
                        placeholder="Reply…"
                        className="min-h-8 min-w-0 flex-1 rounded-lg border border-stone-200 px-2.5 text-sm"
                      />
                      <button disabled={busy} className="min-h-8 rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white">
                        Reply
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </div>
            {!commenter && (
              <p className="border-t border-stone-100 p-3 text-xs text-stone-500">You have view access. Ask the owner for comment access.</p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
