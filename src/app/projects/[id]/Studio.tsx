"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PrototypeFrame } from "@/components/PrototypeFrame";
import { Inspector, useVisualEditor } from "@/components/Inspector";
import { createClient } from "@/lib/supabase/client";
import { authorLabel, type Member, type Message, type Project, type Role, type Thread, type Variant, type VersionMeta } from "@/lib/types";
import {
  deleteProject,
  discardVariants,
  inviteMember,
  keepVariant,
  saveVisualEdit,
  publishVersion,
  removeMember,
  renameProject,
  restoreVersion,
  setAccessMode,
  unpublish,
} from "../actions";

type Tab = "versions" | "share" | "comments";
const DEVICES = [
  { id: "desktop", label: "Desktop", width: "100%" },
  { id: "tablet", label: "Tablet", width: "820px" },
  { id: "phone", label: "Phone", width: "390px" },
] as const;

const STARTERS = [
  "A dispatch board for field techs: one column per tech, an unassigned queue, drag jobs between columns, and flag jobs at risk of missing their SLA.",
  "A mobile onboarding flow for a budgeting app: welcome, connect a bank (mock), pick goals, and a first dashboard.",
  "A SaaS settings page with profile, team members table with roles, billing plan cards and an API keys section.",
];

export function Studio(props: {
  project: Project;
  role: Role;
  userEmail: string;
  versions: VersionMeta[];
  messages: Message[];
  members: Member[];
  threads: Thread[];
  initialHtml: string | null;
  initialVersionId: string | null;
  quota: { plan: "free" | "pro"; limit: number; remaining: number } | null;
  variants: Variant[];
}) {
  const { project, role, versions, messages, members, threads, quota, variants } = props;
  const outOfQuota = quota !== null && quota.remaining <= 0;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialVersionId);
  const [htmlCache, setHtmlCache] = useState<Record<string, string>>(
    props.initialVersionId && props.initialHtml ? { [props.initialVersionId]: props.initialHtml } : {},
  );
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [tab, setTab] = useState<Tab>("versions");
  const [prompt, setPrompt] = useState("");
  const [variantCount, setVariantCount] = useState<1 | 2 | 3>(1);
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const chatEnd = useRef<HTMLDivElement>(null);

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
  const live = versions.find((v) => v.id === project.live_version_id) ?? null;
  const html = selected ? htmlCache[selected.id] : undefined;
  const editor = useVisualEditor(editMode ? html : null);

  function exitEdit() {
    editor.reset();
    setEditMode(false);
  }

  async function saveEdits() {
    const out = editor.result();
    if (!out) return;
    setSavingEdit(true);
    setError("");
    try {
      const saved = await saveVisualEdit(project.id, out.html, out.summary);
      setHtmlCache((c) => ({ ...c, [saved.versionId]: out.html }));
      setSelectedId(saved.versionId);
      exitEdit();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the edit.");
    } finally {
      setSavingEdit(false);
    }
  }
  const openThreads = threads.filter((t) => t.status === "open").length;
  const isOwner = role === "owner";

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!selected || htmlCache[selected.id]) return;
    let cancelled = false;
    supabase
      .from("versions")
      .select("html")
      .eq("id", selected.id)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setHtmlCache((c) => ({ ...c, [selected.id]: data.html }));
      });
    return () => {
      cancelled = true;
    };
  }, [selected, htmlCache, supabase]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    const channel = supabase
      .channel(`studio-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `project_id=eq.${project.id}` }, () =>
        router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comment_threads", filter: `project_id=eq.${project.id}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, router]);

  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setElapsed(0);
    setError("");
    try {
      const many = variantCount > 1;
      const res = await fetch(`/api/projects/${project.id}/${many ? "variants" : "generate"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, baseVersionId: selected?.id ?? null, count: variantCount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setPrompt("");
      if (!many) setSelectedId(data.versionId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function run(action: () => Promise<void>) {
    setError("");
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const reviewUrl = typeof window === "undefined" ? `/p/${project.slug}` : `${window.location.origin}/p/${project.slug}`;
  const width = DEVICES.find((d) => d.id === device)!.width;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-5 py-2.5">
        <Logo href="/projects" />
        <span className="text-stone-300" aria-hidden="true">
          /
        </span>
        <label htmlFor="pname" className="sr-only">
          Prototype name
        </label>
        <input
          id="pname"
          defaultValue={project.name}
          readOnly={!isOwner}
          onBlur={(e) => isOwner && e.target.value !== project.name && run(() => renameProject(project.id, e.target.value))}
          className="min-w-0 max-w-64 rounded-md border border-transparent px-1.5 py-1 font-semibold hover:border-stone-200 focus:border-stone-300 focus:outline-none"
        />
        {project.published && live ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            Live v{live.number}
          </span>
        ) : (
          <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700">Not published</span>
        )}
        <div className="flex-1" />
        <div role="group" aria-label="Preview size" className="flex gap-0.5 rounded-lg bg-stone-100 p-0.5">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={device === d.id}
              onClick={() => setDevice(d.id)}
              className={`min-h-8 rounded-md px-3 text-sm font-medium ${
                device === d.id ? "bg-white text-stone-900 shadow-sm" : "text-stone-600"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <a
          href={`/projects/${project.id}/canvas`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-sm font-medium text-stone-900 no-underline hover:bg-stone-50"
        >
          Canvas
          {quota?.plan !== "pro" && <span className="rounded bg-ember-50 px-1 text-[10px] font-bold text-ember-800">PRO</span>}
        </a>
        {project.published && (
          <a
            href={`/p/${project.slug}`}
            target="_blank"
            className="inline-flex min-h-9 items-center rounded-lg border border-stone-200 px-3 text-sm font-medium text-stone-900 no-underline hover:bg-stone-50"
          >
            Open review link
          </a>
        )}
        {isOwner && selected && (
          <button
            type="button"
            disabled={pending || (project.published && project.live_version_id === selected.id)}
            onClick={() => run(() => publishVersion(project.id, selected.id))}
            className="min-h-9 rounded-lg bg-ember-700 px-4 text-sm font-semibold text-white hover:bg-ember-800 disabled:opacity-50"
          >
            {project.published && project.live_version_id === selected.id ? `v${selected.number} is live` : `Publish v${selected.number}`}
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <aside aria-label="Prompt" className="flex w-[380px] shrink-0 flex-col border-r border-stone-200 bg-white">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && !busy && (
              <div className="space-y-3">
                <p className="text-sm text-stone-600">Describe what to build. Try one of these:</p>
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="block w-full rounded-xl border border-stone-200 p-3 text-left text-sm hover:border-ember-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m) => {
              const v = m.version_id ? versions.find((x) => x.id === m.version_id) : null;
              return m.role === "user" ? (
                <div key={m.id} className="ml-8 rounded-2xl rounded-br-sm bg-stone-100 px-3.5 py-2.5 text-sm leading-relaxed">
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="space-y-2 text-sm leading-relaxed">
                  <p>{m.content}</p>
                  {v && (
                    <button
                      type="button"
                      onClick={() => setSelectedId(v.id)}
                      className="rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:border-ember-700"
                    >
                      v{v.number}
                      {v.id === project.live_version_id ? " · Live" : ""}
                    </button>
                  )}
                </div>
              );
            })}
            {busy && (
              <div role="status" className="rounded-xl bg-ember-50 p-3 text-sm text-ember-800">
                {variantCount > 1 ? `Building ${variantCount} variants` : `Building ${selected ? `on v${selected.number}` : "v1"}`}… {elapsed}s.
                Larger prototypes can take a minute or two.
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form onSubmit={generate} className="border-t border-stone-100 p-4">
            <label htmlFor="prompt" className="mb-1.5 block text-xs font-semibold text-stone-500">
              {versions.length ? `Describe a change to v${selected?.number ?? ""}` : "Describe your prototype"}
            </label>
            <textarea
              id="prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
              }}
              placeholder={versions.length ? "Make the cards denser on tablet…" : "A dispatch board for field techs…"}
              className="w-full resize-none rounded-xl border border-stone-300 p-3 text-sm outline-none focus:border-ember-700"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-stone-500">
                {quota?.plan === "free"
                  ? `${quota.remaining} of ${quota.limit} free builds left this month`
                  : "⌘↵ to send"}
              </span>
              <label htmlFor="variant-count" className="sr-only">
                Number of variants
              </label>
              <select
                id="variant-count"
                value={variantCount}
                onChange={(e) => setVariantCount(Number(e.target.value) as 1 | 2 | 3)}
                disabled={busy}
                title="Generate alternatives to compare. Each variant counts as one build."
                className="ml-auto mr-2 min-h-10 rounded-lg border border-stone-300 bg-white px-2 text-sm"
              >
                <option value={1}>1 version</option>
                <option value={2}>2 variants</option>
                <option value={3}>3 variants</option>
              </select>
              <button
                type="submit"
                disabled={busy || !prompt.trim() || outOfQuota}
                className="min-h-10 rounded-lg bg-ember-700 px-4 text-sm font-semibold text-white hover:bg-ember-800 disabled:opacity-50"
              >
                {busy ? "Building…" : variantCount > 1 ? "Compare" : versions.length ? "Update" : "Build"}
              </button>
            </div>
            {outOfQuota && quota?.plan === "free" && (
              <div className="mt-3 rounded-xl border border-ember-700 bg-ember-50 p-3 text-sm">
                <p className="font-semibold">You&apos;ve used this month&apos;s free builds.</p>
                <p className="mt-0.5 text-stone-700">Pro is $20/month with $10 of AI usage included.</p>
                <form action="/api/billing/checkout" method="post" className="mt-2">
                  <button className="min-h-9 rounded-lg bg-ember-700 px-3 text-sm font-semibold text-white hover:bg-ember-800">
                    Upgrade to Pro
                  </button>
                </form>
              </div>
            )}
            {outOfQuota && quota?.plan === "pro" && !error && (
              <p className="mt-2 text-sm text-stone-600">
                You&apos;ve hit the daily safety limit of {quota.limit} builds. It frees up on a rolling 24-hour basis.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        </aside>

        {variants.length > 0 ? (
          <VariantCompare
            variants={variants}
            pending={pending}
            onKeep={(v) =>
              run(async () => {
                const kept = await keepVariant(project.id, v.id);
                setSelectedId(kept.versionId);
              })
            }
            onDiscard={() => run(() => discardVariants(project.id, variants[0].group_id))}
          />
        ) : (
        <main className="flex min-w-0 flex-1 flex-col bg-stone-100 p-5">
          <div className="mb-2 flex items-center gap-3 text-sm text-stone-600">
            <span className="shrink-0">
              {selected ? `${editMode ? "Editing" : "Preview"} · v${selected.number}${editMode ? "" : " · interactive"}` : "Preview"}
            </span>
            <span className="min-w-0 flex-1 truncate text-stone-500">
              {editMode ? "Click an element to edit it. Links and buttons are paused while editing." : selected?.summary}
            </span>
            {html && (
              <button
                type="button"
                aria-pressed={editMode}
                onClick={() => (editMode ? exitEdit() : setEditMode(true))}
                className={`min-h-8 shrink-0 rounded-lg px-3 text-sm font-semibold ${
                  editMode ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50"
                }`}
              >
                {editMode ? "Exit editing" : "Edit visually"}
              </button>
            )}
          </div>
          <div
            className="mx-auto h-full w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-[max-width]"
            style={{ maxWidth: width }}
          >
            {html ? (
              editMode && editor.editableHtml ? (
                <PrototypeFrame
                  ref={editor.frame}
                  html={editor.editableHtml}
                  title={`${project.name} v${selected?.number} (editing)`}
                  editMode
                  onSelectElement={editor.setSelected}
                />
              ) : (
                <PrototypeFrame html={html} title={`${project.name} v${selected?.number}`} />
              )
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-center text-stone-500">
                {selected ? "Loading…" : "Your prototype will appear here. Describe it on the left to build v1."}
              </div>
            )}
          </div>
        </main>
        )}

        {editMode ? (
          <aside aria-label="Visual editor" className="flex w-[340px] shrink-0 flex-col border-l border-stone-200 bg-white">
            <Inspector
              selected={editor.selected}
              editCount={editor.edits.length}
              onChange={editor.change}
              onSave={saveEdits}
              onDiscard={exitEdit}
              saving={savingEdit}
              saveLabel={`Save as v${(versions[0]?.number ?? 0) + 1}`}
            />
          </aside>
        ) : (
        <aside aria-label="Project panel" className="flex w-[340px] shrink-0 flex-col border-l border-stone-200 bg-white">
          <div role="tablist" className="flex gap-1 border-b border-stone-100 p-2">
            {(
              [
                ["versions", `Versions (${versions.length})`],
                ["share", "Share"],
                ["comments", `Comments${openThreads ? ` (${openThreads})` : ""}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`min-h-9 flex-1 rounded-md text-sm font-medium ${
                  tab === id ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === "versions" && (
              <ul>
                {versions.length === 0 && <li className="p-5 text-sm text-stone-500">No versions yet.</li>}
                {versions.map((v) => (
                  <li key={v.id} className={`border-b border-stone-100 px-4 py-3 ${v.id === selected?.id ? "bg-ember-50" : ""}`}>
                    <button type="button" onClick={() => setSelectedId(v.id)} className="w-full text-left">
                      <span className="flex items-center gap-2">
                        <strong>v{v.number}</strong>
                        {v.id === project.live_version_id && project.published && (
                          <span className="rounded bg-emerald-50 px-1.5 text-[11px] font-bold text-emerald-800">LIVE</span>
                        )}
                        {v.source !== "ai" && (
                          <span className="rounded bg-stone-100 px-1.5 text-[11px] font-semibold text-stone-600">
                            {{ restore: "Restore", edit: "Visual edit", variant: "Variant" }[v.source]}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-stone-500">
                          {new Date(v.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      </span>
                      <span className="mt-1 block text-sm text-stone-700">{v.summary}</span>
                      {v.prompt && <span className="mt-1 block truncate text-xs text-stone-500">“{v.prompt}”</span>}
                    </button>
                    {v.id === selected?.id && v.id !== versions[0]?.id && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => restoreVersion(project.id, v.id))}
                        className="mt-2 min-h-8 rounded-md border border-stone-200 bg-white px-2.5 text-xs font-semibold hover:bg-stone-50"
                      >
                        Restore as new version
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {tab === "share" && (
              <SharePanel
                project={project}
                isOwner={isOwner}
                members={members}
                reviewUrl={reviewUrl}
                pending={pending}
                run={run}
              />
            )}

            {tab === "comments" && (
              <div>
                {threads.length === 0 && (
                  <p className="p-5 text-sm text-stone-500">
                    No comments yet. Reviewers pin comments on the published prototype from the review link.
                  </p>
                )}
                {threads
                  .slice()
                  .reverse()
                  .map((t, i) => {
                    const v = versions.find((x) => x.id === t.version_id);
                    return (
                      <article key={t.id} className="space-y-2 border-b border-stone-100 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`grid h-5 w-5 place-items-center rounded-full font-bold text-white ${
                              t.status === "open" ? "bg-ember-700" : "bg-stone-500"
                            }`}
                          >
                            {threads.length - i}
                          </span>
                          {v && <span className="rounded bg-stone-100 px-1.5 font-semibold text-stone-700">v{v.number}</span>}
                          <span className="text-stone-500">{t.status === "resolved" ? "Resolved" : "Open"}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await supabase
                                .from("comment_threads")
                                .update({
                                  status: t.status === "open" ? "resolved" : "open",
                                  resolved_at: t.status === "open" ? new Date().toISOString() : null,
                                })
                                .eq("id", t.id);
                              router.refresh();
                            }}
                            className="ml-auto rounded border border-stone-200 px-2 py-0.5 font-medium hover:bg-stone-50"
                          >
                            {t.status === "open" ? "Resolve" : "Reopen"}
                          </button>
                        </div>
                        {t.comments
                          .slice()
                          .sort((a, b) => a.created_at.localeCompare(b.created_at))
                          .map((c) => (
                            <p key={c.id} className="text-sm leading-relaxed">
                              <strong className="font-semibold">{authorLabel(c)}</strong> {c.body}
                            </p>
                          ))}
                      </article>
                    );
                  })}
                {project.published && (
                  <a href={`/p/${project.slug}`} target="_blank" className="block p-4 text-sm font-semibold">
                    Open the review page to reply and pin comments
                  </a>
                )}
              </div>
            )}
          </div>
          {isOwner && (
            <div className="border-t border-stone-100 p-3 text-right">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${project.name}" and all its versions and comments? This can't be undone.`)) {
                    run(() => deleteProject(project.id));
                  }
                }}
                className="text-xs font-medium text-red-700 hover:underline"
              >
                Delete prototype
              </button>
            </div>
          )}
        </aside>
        )}
      </div>
    </div>
  );
}

function SharePanel({
  project,
  isOwner,
  members,
  reviewUrl,
  pending,
  run,
}: {
  project: Project;
  isOwner: boolean;
  members: Member[];
  reviewUrl: string;
  pending: boolean;
  run: (a: () => Promise<void>) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "commenter" | "editor">("commenter");
  const [copied, setCopied] = useState(false);

  if (!isOwner) {
    return <p className="p-5 text-sm text-stone-600">Only the owner can change who has access.</p>;
  }

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Review link</h2>
        {project.published ? (
          <>
            <div className="flex gap-2">
              <input readOnly value={reviewUrl} aria-label="Review link" className="min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 text-sm" />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(reviewUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="min-h-9 rounded-lg border border-stone-200 px-3 text-sm font-medium hover:bg-stone-50"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => unpublish(project.id))}
              className="text-xs font-medium text-stone-600 hover:underline"
            >
              Unpublish
            </button>
          </>
        ) : (
          <p className="text-sm text-stone-600">Publish a version (top right) to get a review link.</p>
        )}
      </section>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Who can open it</legend>
        {(
          [
            ["invite", "Only people I invite", "They sign in with an emailed link."],
            ["public", "Anyone with the link", "View only. Comments stay with invited reviewers."],
          ] as const
        ).map(([value, title, desc]) => (
          <label
            key={value}
            className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 ${
              project.access_mode === value ? "border-ember-700 bg-ember-50" : "border-stone-200"
            }`}
          >
            <input
              type="radio"
              name="access"
              checked={project.access_mode === value}
              disabled={pending}
              onChange={() => run(() => setAccessMode(project.id, value))}
              className="mt-1 accent-ember-700"
            />
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs text-stone-600">{desc}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Invite people</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = email;
            run(async () => {
              await inviteMember(project.id, value, role);
              setEmail("");
            });
          }}
          className="flex flex-wrap gap-2"
        >
          <label htmlFor="inv" className="sr-only">
            Email
          </label>
          <input
            id="inv"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="min-h-9 min-w-0 flex-1 rounded-lg border border-stone-300 px-2.5 text-sm"
          />
          <label htmlFor="invrole" className="sr-only">
            Role
          </label>
          <select
            id="invrole"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="min-h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm"
          >
            <option value="commenter">Commenter</option>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button disabled={pending} className="min-h-9 rounded-lg bg-stone-900 px-3 text-sm font-semibold text-white">
            Invite
          </button>
        </form>
        <p className="text-xs text-stone-500">Send them the review link. They sign in with this email to get access.</p>
        <ul className="divide-y divide-stone-100">
          {members.map((m) => (
            <li key={m.email} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{m.email}</span>
              <span className="text-xs capitalize text-stone-600">{m.role}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => removeMember(project.id, m.email))}
                aria-label={`Remove ${m.email}`}
                className="rounded px-1.5 text-xs text-red-700 hover:bg-red-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function VariantCompare({
  variants,
  pending,
  onKeep,
  onDiscard,
}: {
  variants: Variant[];
  pending: boolean;
  onKeep: (v: Variant) => void;
  onDiscard: () => void;
}) {
  return (
    <main className="flex min-w-0 flex-1 flex-col bg-stone-100 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Compare {variants.length} variants</h2>
          <p className="truncate text-sm text-stone-600">“{variants[0].prompt}”. Keep one to make it the next version.</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onDiscard}
          className="min-h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium hover:bg-stone-50"
        >
          Discard all
        </button>
      </div>
      <div className={`grid min-h-0 flex-1 gap-4 ${variants.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {variants.map((v) => (
          <section key={v.id} aria-label={`Variant ${v.position}`} className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 border-b border-stone-100 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Variant {v.position}</p>
                {v.summary && <p className="line-clamp-2 text-xs text-stone-600">{v.summary}</p>}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => onKeep(v)}
                className="min-h-9 shrink-0 rounded-lg bg-ember-700 px-3 text-sm font-semibold text-white hover:bg-ember-800 disabled:opacity-50"
              >
                Keep this
              </button>
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
