"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PrototypeFrame } from "@/components/PrototypeFrame";
import { createClient } from "@/lib/supabase/client";
import { authorLabel, type Member, type Message, type Project, type Role, type Thread, type VersionMeta } from "@/lib/types";
import {
  deleteProject,
  inviteMember,
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
  quota: { limit: number; remaining: number } | null;
}) {
  const { project, role, versions, messages, members, threads, quota } = props;
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
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const chatEnd = useRef<HTMLDivElement>(null);

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
  const live = versions.find((v) => v.id === project.live_version_id) ?? null;
  const html = selected ? htmlCache[selected.id] : undefined;
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
      const res = await fetch(`/api/projects/${project.id}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, baseVersionId: selected?.id ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setPrompt("");
      setSelectedId(data.versionId);
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
                Building {selected ? `on v${selected.number}` : "v1"}… {elapsed}s. Larger prototypes can take a minute or two.
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
                {quota ? `${quota.remaining} of ${quota.limit} builds left today` : "⌘↵ to send"}
              </span>
              <button
                type="submit"
                disabled={busy || !prompt.trim() || outOfQuota}
                className="min-h-10 rounded-lg bg-ember-700 px-4 text-sm font-semibold text-white hover:bg-ember-800 disabled:opacity-50"
              >
                {busy ? "Building…" : versions.length ? "Update" : "Build"}
              </button>
            </div>
            {outOfQuota && !error && (
              <p className="mt-2 text-sm text-stone-600">
                You've used today's {quota?.limit} builds. More free up as each one passes 24 hours.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </form>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col bg-stone-100 p-5">
          <div className="mb-2 flex items-center justify-between text-sm text-stone-600">
            <span>{selected ? `Preview · v${selected.number} · interactive` : "Preview"}</span>
            {selected?.summary && <span className="truncate pl-4 text-stone-500">{selected.summary}</span>}
          </div>
          <div
            className="mx-auto h-full w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-[max-width]"
            style={{ maxWidth: width }}
          >
            {html ? (
              <PrototypeFrame html={html} title={`${project.name} v${selected?.number}`} />
            ) : (
              <div className="flex h-full items-center justify-center p-10 text-center text-stone-500">
                {selected ? "Loading…" : "Your prototype will appear here. Describe it on the left to build v1."}
              </div>
            )}
          </div>
        </main>

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
                        {v.source === "restore" && (
                          <span className="rounded bg-stone-100 px-1.5 text-[11px] font-semibold text-stone-600">Restore</span>
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
