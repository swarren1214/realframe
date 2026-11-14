"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowUp,
  Boxes,
  Expand,
  Upload,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  Globe,
  History,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  Monitor,
  PencilRuler,
  RotateCcw,
  Rocket,
  Share2,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Mark } from "@/components/Logo";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupCard } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { Spinner } from "@/components/ui/spinner";
import { Eyebrow } from "@/components/Eyebrow";
import { cn } from "@/lib/utils";
import { PrototypeFrame } from "@/components/PrototypeFrame";
import { ImportDialog } from "@/components/ImportDialog";
import { BuildList, BuildLog, SourceCard, useBuilds, type Build, type Source } from "@/components/builds/Builds";
import { PRESENT_FRAME_CLASS, PresentControls, enterFullscreen } from "@/components/PresentMode";
import { Inspector, useVisualEditor } from "@/components/Inspector";
import { createClient } from "@/lib/supabase/client";
import { reviewUrlFor } from "@/lib/hosts";
import { authorLabel, type Member, type Message, type Project, type Role, type Thread, type Variant, type VersionMeta } from "@/lib/types";
import {
  contentUrl as raw_contentUrl,
  deleteProject as raw_deleteProject,
  discardVariants as raw_discardVariants,
  inviteMember as raw_inviteMember,
  keepVariant as raw_keepVariant,
  saveVisualEdit as raw_saveVisualEdit,
  publishVersion as raw_publishVersion,
  removeMember as raw_removeMember,
  renameProject as raw_renameProject,
  restoreVersion as raw_restoreVersion,
  setAccessMode as raw_setAccessMode,
  setGuestComments as raw_setGuestComments,
  setProjectPassword as raw_setProjectPassword,
  updateSlug as raw_updateSlug,
  unpublish as raw_unpublish,
} from "../actions";
import { unwrapped } from "@/lib/safe-action";

const contentUrl = unwrapped(raw_contentUrl);
const deleteProject = unwrapped(raw_deleteProject);
const discardVariants = unwrapped(raw_discardVariants);
const inviteMember = unwrapped(raw_inviteMember);
const keepVariant = unwrapped(raw_keepVariant);
const saveVisualEdit = unwrapped(raw_saveVisualEdit);
const publishVersion = unwrapped(raw_publishVersion);
const removeMember = unwrapped(raw_removeMember);
const renameProject = unwrapped(raw_renameProject);
const restoreVersion = unwrapped(raw_restoreVersion);
const setAccessMode = unwrapped(raw_setAccessMode);
const setGuestComments = unwrapped(raw_setGuestComments);
const setProjectPassword = unwrapped(raw_setProjectPassword);
const updateSlug = unwrapped(raw_updateSlug);
const unpublish = unwrapped(raw_unpublish);

type Tab = "versions" | "share" | "comments";
const DEVICES = [
  { id: "desktop", label: "Desktop", width: "100%", icon: Monitor },
  { id: "tablet", label: "Tablet", width: "820px", icon: Tablet },
  { id: "phone", label: "Phone", width: "390px", icon: Smartphone },
] as const;
type DeviceId = (typeof DEVICES)[number]["id"];

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
  /** Content-domain URL when the latest version is an imported app. */
  initialSrc?: string | null;
  quota: { plan: "free" | "pro"; limit: number; remaining: number } | null;
  variants: Variant[];
  /** The GitHub repository this prototype builds from, and its recent builds. */
  source?: Source | null;
  builds?: Build[];
  /** The profile menu, rendered on the server and passed through. */
  accountMenu?: React.ReactNode;
}) {
  const { project, role, versions, messages, members, threads, quota, variants } = props;
  const outOfQuota = quota !== null && quota.remaining <= 0;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [selectedId, setSelectedId] = useState<string | null>(props.initialVersionId);
  const [htmlCache, setHtmlCache] = useState<Record<string, string>>(
    props.initialVersionId && props.initialHtml ? { [props.initialVersionId]: props.initialHtml } : {},
  );
  const [srcCache, setSrcCache] = useState<Record<string, string>>(
    props.initialVersionId && props.initialSrc ? { [props.initialVersionId]: props.initialSrc } : {},
  );
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("versions");
  const [prompt, setPrompt] = useState("");
  const [variantCount, setVariantCount] = useState<1 | 2 | 3>(1);
  const [editMode, setEditMode] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const { builds, now } = useBuilds(project.id, props.builds ?? []);
  const [logBuildId, setLogBuildId] = useState<string | null>(() =>
    versions.length === 0 ? ((props.builds ?? []).find((b) => b.status === "queued" || b.status === "building")?.id ?? null) : null,
  );
  const buildRunning = builds.some((b) => b.status === "queued" || b.status === "building");
  const [savingEdit, setSavingEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const chatEnd = useRef<HTMLDivElement>(null);

  const selected = versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
  const live = versions.find((v) => v.id === project.live_version_id) ?? null;
  const isImportedApp = selected?.kind === "bundle";
  const html = selected && !isImportedApp ? htmlCache[selected.id] : undefined;
  const src = selected && isImportedApp ? srcCache[selected.id] : undefined;
  const hasPreview = Boolean(html || src);
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
    if (!selected || htmlCache[selected.id] || srcCache[selected.id]) return;
    let cancelled = false;
    if (selected.kind === "bundle") {
      contentUrl(selected.id)
        .then((url) => !cancelled && setSrcCache((c) => ({ ...c, [selected.id]: url })))
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
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
  }, [selected, htmlCache, srcCache, supabase]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_threads", filter: `project_id=eq.${project.id}` }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, router]);

  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || busy || isImportedApp) return;
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

  /** Run a server action; `key` lets the triggering button show its own loading state. */
  function run(action: () => Promise<void>, key?: string) {
    setError("");
    setBusyKey(key ?? null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setBusyKey(null);
      }
    });
  }
  const isBusy = (key: string) => pending && busyKey === key;

  const reviewUrl = typeof window === "undefined" ? `/p/${project.slug}` : reviewUrlFor(project.slug, window.location.host);
  const width = DEVICES.find((d) => d.id === device)!.width;
  const isLive = project.published && selected && project.live_version_id === selected.id;

  return (
    <div className="flex h-screen flex-col">
      <header className="glass mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5">
        <Link href="/projects" aria-label="All prototypes" className="rounded-full p-1 hover:bg-stone-900/5">
          <Mark size={26} />
        </Link>
        <label htmlFor="pname" className="sr-only">
          Prototype name
        </label>
        <input
          id="pname"
          defaultValue={project.name}
          readOnly={!isOwner}
          onBlur={(e) => isOwner && e.target.value !== project.name && run(() => renameProject(project.id, e.target.value))}
          className="h-8 min-w-0 max-w-56 rounded-full border border-transparent px-2.5 text-sm font-semibold hover:border-stone-200 focus:border-raspberry-600 focus:outline-none"
        />
        {project.published && live ? (
          <Badge variant="success">
            <BadgeDot />
            Live v{live.number}
          </Badge>
        ) : (
          <Badge>Not published</Badge>
        )}
        <div className="flex-1" />
        <ToggleGroup type="single" aria-label="Preview size" value={device} onValueChange={(v) => v && setDevice(v as DeviceId)}>
          {DEVICES.map(({ id, label, icon: Icon }) => (
            <ToggleGroupItem key={id} value={id} aria-label={label} title={label}>
              <Icon />
              <span className="hidden xl:inline">{label}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button asChild variant="ghost">
          <Link href={`/projects/${project.id}/canvas`}>
            <LayoutGrid />
            Canvas
            {quota?.plan !== "pro" && (
              <Badge variant="default" className="ml-0.5">
                Pro
              </Badge>
            )}
          </Link>
        </Button>
        {project.published && (
          <Button asChild variant="ghost">
            <a href={reviewUrl} target="_blank" rel="noreferrer">
              <ExternalLink />
              Review link
            </a>
          </Button>
        )}
        {isOwner && selected && (
          <Button
            variant="default"
            loading={isBusy("publish")}
            disabled={pending || Boolean(isLive)}
            onClick={() => run(() => publishVersion(project.id, selected.id), "publish")}
          >
            {isLive ? <Check /> : <Rocket />}
            {isLive ? `v${selected.number} is live` : `Publish v${selected.number}`}
          </Button>
        )}
        {props.accountMenu}
      </header>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <aside aria-label="Prompt" className="glass flex w-[360px] shrink-0 flex-col overflow-hidden rounded-[1.75rem]">
          <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
            <MessageSquare className="size-4 text-stone-500" aria-hidden="true" />
            <h2 className="text-[13px] font-semibold">Chat</h2>
            {quota?.plan === "free" && (
              <span className="ml-auto text-[11px] text-stone-500">
                {quota.remaining}/{quota.limit} free builds left
              </span>
            )}
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && !busy && (
              <div className="space-y-2">
                <p className="text-[13px] text-stone-600">Describe what to build, or start from one of these:</p>
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="flex w-full gap-2.5 rounded-2xl border border-stone-200 bg-white p-3 text-left text-[13px] leading-snug text-stone-700 transition-colors hover:border-raspberry-200 hover:bg-raspberry-50/50 active:scale-[.99]"
                  >
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-raspberry-700" aria-hidden="true" />
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m) => {
              const v = m.version_id ? versions.find((x) => x.id === m.version_id) : null;
              return m.role === "user" ? (
                <div
                  key={m.id}
                  className="ml-8 rounded-3xl rounded-br-md border border-raspberry-100 bg-glow-soft px-3.5 py-2.5 text-[13px] leading-relaxed"
                >
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="space-y-2 text-[13px] leading-relaxed text-stone-800">
                  <p>{m.content}</p>
                  {v && (
                    <Button size="sm" onClick={() => setSelectedId(v.id)}>
                      <History />v{v.number}
                      {v.id === project.live_version_id ? " · Live" : ""}
                    </Button>
                  )}
                </div>
              );
            })}
            {busy && (
              <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-glow-soft p-3 text-[13px] text-raspberry-800">
                <Spinner className="mt-0.5 shrink-0" />
                <span>
                  {variantCount > 1 ? `Building ${variantCount} variants` : `Building ${selected ? `on v${selected.number}` : "v1"}`}…{" "}
                  {elapsed}s<span className="block text-xs text-raspberry-800/70">Larger prototypes can take a minute or two.</span>
                </span>
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          <form onSubmit={generate} className="border-t border-stone-100 p-3">
            {isImportedApp && (
              <p className="mb-2 flex gap-2 rounded-2xl bg-secondary p-3 text-xs text-stone-700">
                <Boxes className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {selected?.source === "github" && props.source
                  ? `v${selected?.number} was built from GitHub, so prompts can't change it yet. Push to ${props.source.branch} for the next version, or pick a prompt-built version to keep working with AI.`
                  : `v${selected?.number} is an imported app, so prompts can't change it yet. Import a new zip for the next version, or pick a generated version to build on.`}
              </p>
            )}
            <label htmlFor="prompt" className="sr-only">
              {versions.length ? `Describe a change to v${selected?.number ?? ""}` : "Describe your prototype"}
            </label>
            <div className="rounded-3xl border border-stone-200 bg-white p-1.5 transition-[border-color,box-shadow] focus-within:border-raspberry-600 focus-within:ring-4 focus-within:ring-raspberry-100">
              <textarea
                id="prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
                }}
                placeholder={versions.length ? `Describe a change to v${selected?.number ?? ""}…` : "A dispatch board for field techs…"}
                className="block w-full resize-none bg-transparent px-2.5 pt-1.5 text-[13px] leading-relaxed outline-none placeholder:text-stone-400"
              />
              <div className="flex items-center gap-1.5">
                <Select value={String(variantCount)} onValueChange={(v) => setVariantCount(Number(v) as 1 | 2 | 3)} disabled={busy}>
                  <SelectTrigger
                    size="sm"
                    aria-label="Number of variants"
                    title="Generate alternatives to compare. Each variant counts as one build."
                    className="border-transparent bg-secondary shadow-none hover:border-transparent"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 version</SelectItem>
                    <SelectItem value="2">2 variants</SelectItem>
                    <SelectItem value="3">3 variants</SelectItem>
                  </SelectContent>
                </Select>
                <Kbd className="ml-auto">⌘↵</Kbd>
                <Button
                  variant="default"
                  size="icon"
                  aria-label={variantCount > 1 ? "Generate variants" : versions.length ? "Update prototype" : "Build prototype"}
                  title={variantCount > 1 ? "Generate variants" : versions.length ? "Update prototype" : "Build prototype"}
                  type="submit"
                  loading={busy}
                  disabled={!prompt.trim() || outOfQuota || isImportedApp}
                >
                  <ArrowUp />
                </Button>
              </div>
            </div>
            {outOfQuota && quota?.plan === "free" && (
              <div className="mt-2.5 rounded-2xl border border-raspberry-200 bg-glow-soft p-3 text-[13px]">
                <p className="font-semibold">You&apos;ve used this month&apos;s free builds.</p>
                <p className="mt-0.5 text-xs text-stone-700">Pro is $20/month with $10 of AI usage included.</p>
                <form action="/api/billing/checkout" method="post" className="mt-2">
                  <Button variant="default" size="sm" type="submit">
                    <Sparkles />
                    Upgrade to Pro
                  </Button>
                </form>
              </div>
            )}
            {outOfQuota && quota?.plan === "pro" && !error && (
              <p className="mt-2 text-xs text-stone-600">
                You&apos;ve hit the daily safety limit of {quota.limit} builds. It frees up on a rolling 24-hour basis.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {error}
              </p>
            )}
          </form>
        </aside>

        {variants.length > 0 ? (
          <VariantCompare
            variants={variants}
            busyKey={pending ? busyKey : null}
            onKeep={(v) =>
              run(async () => {
                const kept = await keepVariant(project.id, v.id);
                setSelectedId(kept.versionId);
              }, `keep-${v.id}`)
            }
            onDiscard={() => run(() => discardVariants(project.id, variants[0].group_id), "discard")}
          />
        ) : (
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              {selected && <Badge>{editMode ? `Editing v${selected.number}` : `v${selected.number}`}</Badge>}
              <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
                {editMode ? "Click an element to edit it. Links and buttons are paused while editing." : selected?.summary}
              </span>
              {hasPreview && !editMode && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Show this version full screen"
                  onClick={() => {
                    enterFullscreen();
                    setPresenting(true);
                  }}
                >
                  <Expand />
                  Full screen
                </Button>
              )}
              {html && (
                <Button size="sm" aria-pressed={editMode} onClick={() => (editMode ? exitEdit() : setEditMode(true))}>
                  {editMode ? <X /> : <PencilRuler />}
                  {editMode ? "Exit editing" : "Edit visually"}
                </Button>
              )}
            </div>
            {presenting && hasPreview && <PresentControls onExit={() => setPresenting(false)} />}
            <div
              className={cn(
                "mx-auto min-h-0 w-full flex-1 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)] transition-[max-width] duration-300",
                presenting && hasPreview && PRESENT_FRAME_CLASS,
              )}
              style={{ maxWidth: presenting && hasPreview ? undefined : width }}
            >
              {src ? (
                <PrototypeFrame src={src} title={`${project.name} v${selected?.number}`} />
              ) : html ? (
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
                <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center text-[13px] text-stone-500">
                  {selected ? (
                    <Spinner />
                  ) : (
                    <>
                      <div aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-glow-soft text-raspberry-700">
                        <Sparkles className="size-5" />
                      </div>
                      {buildRunning
                        ? "Building from GitHub. v1 appears here when it's done."
                        : "Your prototype will appear here. Describe it on the left to build v1."}
                    </>
                  )}
                </div>
              )}
            </div>
            {logBuildId && (
              <div className="mt-3">
                <BuildLog buildId={logBuildId} onClose={() => setLogBuildId(null)} />
              </div>
            )}
          </main>
        )}

        {editMode ? (
          <aside aria-label="Visual editor" className="glass flex w-[320px] shrink-0 flex-col overflow-hidden rounded-[1.75rem]">
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
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            aria-label="Project panel"
            className="glass w-[320px] shrink-0 overflow-hidden rounded-[1.75rem]"
          >
            <div className="border-b border-stone-100 p-2">
              <TabsList>
                {(
                  [
                    ["versions", "Versions", History, versions.length],
                    ["share", "Share", Share2, 0],
                    ["comments", "Comments", MessageSquare, openThreads],
                  ] as const
                ).map(([id, label, Icon, count]) => (
                  <TabsTrigger key={id} value={id}>
                    <Icon />
                    {label}
                    {count > 0 && <span className="text-[10px] text-muted-foreground">{count}</span>}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="versions">
                {(props.source || builds.length > 0) && (
                  <div className="space-y-1 px-2 pt-2">
                    {props.source && <SourceCard source={props.source} isOwner={isOwner} running={buildRunning} onBuilt={setLogBuildId} />}
                    <BuildList projectId={project.id} builds={builds} now={now} onShowLog={setLogBuildId} onBuilt={setLogBuildId} />
                  </div>
                )}
                <div className="px-2 pt-2">
                  <ImportDialog
                    projectId={project.id}
                    onImported={(id) => setSelectedId(id)}
                    trigger={
                      <Button variant="ghost" size="sm" className="w-full justify-start">
                        <Upload />
                        Import a new version
                      </Button>
                    }
                  />
                </div>
                <ul className="space-y-1 p-2">
                  {versions.length === 0 && <li className="p-4 text-[13px] text-stone-500">No versions yet.</li>}
                  {versions.map((v) => {
                    const on = v.id === selected?.id;
                    return (
                      <li
                        key={v.id}
                        className={cn(
                          "rounded-2xl p-3 transition-colors",
                          on ? "bg-glow-soft shadow-[inset_0_0_0_1px_#fbcfe8]" : "hover:bg-stone-900/[.03]",
                        )}
                      >
                        <button type="button" onClick={() => setSelectedId(v.id)} className="w-full text-left">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold">v{v.number}</span>
                            {v.id === project.live_version_id && project.published && (
                              <Badge variant="success">
                                <BadgeDot />
                                Live
                              </Badge>
                            )}
                            {v.source !== "ai" && (
                              <Badge>
                                {
                                  { restore: "Restore", edit: "Visual edit", variant: "Variant", import: "Import", github: "GitHub" }[
                                    v.source
                                  ]
                                }
                              </Badge>
                            )}
                            <span className="ml-auto text-[11px] text-stone-500">
                              {new Date(v.created_at).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </span>
                          {v.summary && <span className="mt-1 block text-xs leading-relaxed text-stone-700">{v.summary}</span>}
                          {v.prompt && <span className="mt-1 block truncate text-[11px] text-stone-500">“{v.prompt}”</span>}
                        </button>
                        {on && v.id !== versions[0]?.id && (
                          <Button
                            size="sm"
                            className="mt-2"
                            loading={isBusy(`restore-${v.id}`)}
                            disabled={pending}
                            onClick={() => run(() => restoreVersion(project.id, v.id), `restore-${v.id}`)}
                          >
                            <RotateCcw />
                            Restore as new version
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </TabsContent>

              <TabsContent value="share">
                <SharePanel
                  project={project}
                  isOwner={isOwner}
                  members={members}
                  reviewUrl={reviewUrl}
                  pending={pending}
                  isBusy={isBusy}
                  run={run}
                />
              </TabsContent>

              <TabsContent value="comments">
                <div className="space-y-1 p-2">
                  {threads.length === 0 && (
                    <div className="flex flex-col items-center gap-2 p-6 text-center text-[13px] text-stone-500">
                      <MessageSquare className="size-5 text-stone-400" aria-hidden="true" />
                      No comments yet. Reviewers pin comments on the published prototype from the review link.
                    </div>
                  )}
                  {threads
                    .slice()
                    .reverse()
                    .map((t, i) => {
                      const v = versions.find((x) => x.id === t.version_id);
                      return (
                        <article key={t.id} className="space-y-2 rounded-2xl p-3 hover:bg-stone-900/[.03]">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span
                              className={cn(
                                "grid size-5 place-items-center rounded-full text-[10px] font-bold text-white",
                                t.status === "open" ? "btn-glow" : "bg-stone-400",
                              )}
                            >
                              {threads.length - i}
                            </span>
                            {v && <Badge>v{v.number}</Badge>}
                            <span className="text-stone-500">{t.status === "resolved" ? "Resolved" : "Open"}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-auto h-7"
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
                            >
                              {t.status === "open" ? <CircleCheck /> : <Undo2 />}
                              {t.status === "open" ? "Resolve" : "Reopen"}
                            </Button>
                          </div>
                          {t.comments
                            .slice()
                            .sort((a, b) => a.created_at.localeCompare(b.created_at))
                            .map((c) => (
                              <p key={c.id} className="text-[13px] leading-relaxed">
                                <strong className="font-semibold">{authorLabel(c)}</strong> {c.body}
                              </p>
                            ))}
                        </article>
                      );
                    })}
                  {project.published && (
                    <Button asChild variant="ghost" size="sm" className="m-1">
                      <a href={reviewUrl} target="_blank" rel="noreferrer">
                        <ExternalLink />
                        Open the review page to reply
                      </a>
                    </Button>
                  )}
                </div>
              </TabsContent>
            </div>
            {isOwner && (
              <div className="flex justify-end border-t border-stone-100 p-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" loading={isBusy("delete")}>
                      <Trash2 />
                      Delete prototype
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
                      <AlertDialogDescription>
                        All of its versions, variants and comments go with it. This can&apos;t be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => run(() => deleteProject(project.id), "delete")}>Delete prototype</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </Tabs>
        )}
      </div>
    </div>
  );
}

const ACCESS = [
  { value: "invite", title: "Only people I invite", desc: "They sign in with an emailed link.", icon: Users },
  {
    value: "password",
    title: "Anyone with the password",
    desc: "No account needed. Guests enter the password and a name.",
    icon: KeyRound,
  },
  { value: "public", title: "Anyone with the link", desc: "View only. Comments stay with invited reviewers.", icon: Globe },
] as const;

function SharePanel({
  project,
  isOwner,
  members,
  reviewUrl,
  pending,
  isBusy,
  run,
}: {
  project: Project;
  isOwner: boolean;
  members: Member[];
  reviewUrl: string;
  pending: boolean;
  isBusy: (key: string) => boolean;
  run: (a: () => Promise<void>, key?: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "commenter" | "editor">("commenter");
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState(project.slug);
  const [addressError, setAddressError] = useState("");

  if (!isOwner) {
    return <p className="p-4 text-[13px] text-stone-600">Only the owner can change who has access.</p>;
  }

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <Eyebrow>Review link</Eyebrow>
        {project.published ? (
          <>
            <div className="flex gap-1.5">
              <Input readOnly value={reviewUrl} aria-label="Review link" className="text-xs text-stone-600" />
              <Button
                size="icon"
                aria-label={copied ? "Copied" : "Copy link"}
                title={copied ? "Copied" : "Copy link"}
                onClick={async () => {
                  await navigator.clipboard.writeText(reviewUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              loading={isBusy("unpublish")}
              disabled={pending}
              onClick={() => run(() => unpublish(project.id), "unpublish")}
            >
              Unpublish
            </Button>
          </>
        ) : (
          <p className="text-xs text-stone-600">Publish a version (top right) to get a review link.</p>
        )}
      </section>

      <section className="space-y-2">
        <Eyebrow>Address</Eyebrow>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAddressError("");
            run(async () => {
              try {
                const slug = await updateSlug(project.id, address);
                setAddress(slug);
              } catch (err) {
                setAddressError(err instanceof Error ? err.message : "Couldn't change the address.");
              }
            }, "slug");
          }}
          className="flex items-center gap-1.5"
        >
          <label htmlFor="slug" className="sr-only">
            Subdomain
          </label>
          <div className="flex min-w-0 flex-1 items-center rounded-full border border-stone-200 bg-white pr-3 focus-within:border-raspberry-600 focus-within:ring-4 focus-within:ring-raspberry-100">
            <input
              id="slug"
              value={address}
              onChange={(e) => setAddress(e.target.value.toLowerCase())}
              maxLength={60}
              className="h-9 min-w-0 flex-1 rounded-full bg-transparent pl-3.5 text-[13px] outline-none"
            />
            <span className="shrink-0 text-xs text-stone-400">.realframe.app</span>
          </div>
          {address !== project.slug && (
            <Button variant="secondary" type="submit" loading={isBusy("slug")} disabled={pending}>
              Save
            </Button>
          )}
        </form>
        {addressError ? (
          <p role="alert" className="text-xs text-red-700">
            {addressError}
          </p>
        ) : (
          <p className="text-[11px] text-stone-500">Changing it breaks links you&apos;ve already shared.</p>
        )}
      </section>

      <section className="space-y-2">
        <Eyebrow id="access-label">Who can open it</Eyebrow>
        <RadioGroup
          aria-labelledby="access-label"
          value={project.access_mode}
          disabled={pending}
          onValueChange={(value) => {
            if (value === "password" && !project.has_password) {
              document.getElementById("share-password")?.focus();
              return;
            }
            run(() => setAccessMode(project.id, value as Project["access_mode"]), "access");
          }}
        >
          {ACCESS.map(({ value, title, desc, icon: Icon }) => (
            <RadioGroupCard key={value} value={value}>
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-stone-600 group-data-[state=checked]:btn-glow"
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{title}</span>
                <span className="block text-xs text-stone-600">{desc}</span>
              </span>
              <Check className="ml-auto hidden size-4 shrink-0 text-raspberry-700 group-data-[state=checked]:block" aria-hidden="true" />
            </RadioGroupCard>
          ))}
        </RadioGroup>
        <div className="space-y-2 rounded-2xl bg-stone-900/[.03] p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = password;
              run(async () => {
                await setProjectPassword(project.id, value);
                setPassword("");
              }, "password");
            }}
            className="flex gap-1.5"
          >
            <label htmlFor="share-password" className="sr-only">
              {project.has_password ? "New password" : "Password"}
            </label>
            <Input
              id="share-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={project.has_password ? "Change the password" : "Set a password (6+ characters)"}
            />
            <Button variant="secondary" type="submit" loading={isBusy("password")} disabled={pending}>
              <KeyRound />
              {project.has_password ? "Change" : "Set"}
            </Button>
          </form>
          <div className="flex items-center gap-2">
            <Switch
              id="guest-comments"
              checked={project.guest_comments !== false}
              disabled={pending}
              onCheckedChange={(on) => run(() => setGuestComments(project.id, on), "guests")}
            />
            <Label htmlFor="guest-comments" className="text-stone-700">
              Password guests can comment
            </Label>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <Eyebrow>Invite people</Eyebrow>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = email;
            run(async () => {
              await inviteMember(project.id, value, role);
              setEmail("");
            }, "invite");
          }}
          className="space-y-1.5"
        >
          <label htmlFor="inv" className="sr-only">
            Email
          </label>
          <Input id="inv" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          <div className="flex gap-1.5">
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger aria-label="Role" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="commenter">Commenter</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" type="submit" loading={isBusy("invite")} disabled={pending}>
              <UserPlus />
              Invite
            </Button>
          </div>
        </form>
        <p className="text-[11px] text-stone-500">Send them the review link. They sign in with this email to get access.</p>
        {members.length > 0 && (
          <ul className="space-y-0.5">
            {members.map((m) => (
              <li key={m.email} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-0.5 hover:bg-stone-900/[.03]">
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-glow-soft text-[11px] font-semibold uppercase text-raspberry-800"
                >
                  {m.email[0]}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">{m.email}</span>
                <Badge className="capitalize">{m.role}</Badge>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Remove ${m.email}`}
                  title={`Remove ${m.email}`}
                  loading={isBusy(`remove-${m.email}`)}
                  disabled={pending}
                  onClick={() => run(() => removeMember(project.id, m.email), `remove-${m.email}`)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function VariantCompare({
  variants,
  busyKey,
  onKeep,
  onDiscard,
}: {
  variants: Variant[];
  busyKey: string | null;
  onKeep: (v: Variant) => void;
  onDiscard: () => void;
}) {
  const anyBusy = busyKey !== null;
  return (
    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-raspberry-700" aria-hidden="true" />
            Compare {variants.length} variants
          </h2>
          <p className="truncate text-xs text-stone-600">“{variants[0].prompt}” · Keep one to make it the next version.</p>
        </div>
        <Button loading={busyKey === "discard"} disabled={anyBusy} onClick={onDiscard}>
          <X />
          Discard all
        </Button>
      </div>
      <div className={cn("grid min-h-0 flex-1 gap-3", variants.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {variants.map((v) => (
          <section
            key={v.id}
            aria-label={`Variant ${v.position}`}
            className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]"
          >
            <div className="flex items-start gap-3 border-b border-stone-100 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">Variant {v.position}</p>
                {v.summary && <p className="line-clamp-2 text-xs text-stone-600">{v.summary}</p>}
              </div>
              <Button variant="default" size="sm" loading={busyKey === `keep-${v.id}`} disabled={anyBusy} onClick={() => onKeep(v)}>
                <Check />
                Keep
              </Button>
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
