"use client";
import { MAX_PROMPT, START_PROMPT_KEY } from "@/lib/prompt-shared";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowUp,
  Ellipsis,
  GitCommitHorizontal,
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
  Layers,
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
  UserRoundCheck,
  X,
  Send,
  WandSparkles,
} from "lucide-react";
import { Mark } from "@/components/Logo";
import { Badge, BadgeDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupCard } from "@/components/ui/radio-group";
import { SwitchRow } from "@/components/ui/switch-row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { AnimatePresence, listItem, motion } from "@/components/motion";
import { copyWithToast, notify } from "@/lib/toast";
import { PrototypeFrame } from "@/components/PrototypeFrame";
import { Textarea } from "@/components/ui/textarea";
import { ImportDialog } from "@/components/ImportDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BuildList,
  BuildLog,
  SourceCard,
  useBuilds,
  type Build,
  type Source,
} from "@/components/builds/Builds";
import {
  PRESENT_FRAME_CLASS,
  PresentControls,
  enterFullscreen,
} from "@/components/PresentMode";
import { Inspector, useVisualEditor } from "@/components/Inspector";
import { createClient } from "@/lib/supabase/client";
import { reviewUrlFor } from "@/lib/hosts";
import { RequestReviewDialog } from "@/components/reviews/RequestReviewDialog";
import { RoundCard } from "@/components/reviews/RoundCard";
import { MAX_FIX_THREADS } from "@/lib/feedback";
import type { ReviewRound } from "@/lib/types";
import {
  authorLabel,
  type Member,
  type Message,
  type Project,
  type Role,
  type Thread,
  type Variant,
  type VersionMeta,
} from "@/lib/types";
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
  updateDeviceSettings as raw_updateDeviceSettings,
  setProjectPassword as raw_setProjectPassword,
  updateSlug as raw_updateSlug,
  unpublish as raw_unpublish,
} from "../actions";
import { unwrapped } from "@/lib/safe-action";
import { readSettings } from "@/lib/devices";
import {
  DevicePicker,
  DeviceStage,
  RotateButton,
  useDeviceView,
} from "@/components/devices/DeviceView";
import { DeviceSettingsDialog } from "@/components/devices/DeviceSettingsDialog";
import { MoveToTeamDialog } from "@/components/teams/MoveToTeamDialog";
import {
  TransferDialog,
  type Teammate,
} from "@/components/teams/TransferDialog";
import {
  Dots,
  type DsOption,
} from "@/components/design-systems/DesignSystemSelect";
import { setProjectDesignSystem as raw_setProjectDesignSystem } from "@/app/(app)/design-systems/actions";
import type { Device } from "@/lib/devices";
import type { Team } from "@/lib/team-shared";

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
const updateDeviceSettings = unwrapped(raw_updateDeviceSettings);
const setProjectDesignSystem = unwrapped(raw_setProjectDesignSystem);
const setProjectPassword = unwrapped(raw_setProjectPassword);
const updateSlug = unwrapped(raw_updateSlug);
const unpublish = unwrapped(raw_unpublish);

type Tab = "chat" | "versions" | "share" | "comments";
/** What a successful action says: a message, or a message with Undo or another action. */
type Done =
  | string
  | {
      title: string;
      undo?: () => Promise<unknown>;
      action?: { label: string; onClick: () => void };
    };
type Run = (
  action: () => Promise<void | Done>,
  key?: string,
  done?: Done,
) => void;

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
  quota: {
    plan: "free" | "pro" | "team";
    limit: number;
    remaining: number;
  } | null;
  variants: Variant[];
  /** The GitHub repository this prototype builds from, and its recent builds. */
  source?: Source | null;
  builds?: Build[];
  /** The team's own device templates. */
  teamDevices?: Device[];
  /** Teams the owner can move this prototype into. */
  teams?: Team[];
  /** People on the prototype's team, for transferring ownership. */
  teammates?: Teammate[];
  /** The team's design systems, for the composer's picker and version badges. */
  designSystems?: DsOption[];
  allDesignSystemNames?: Record<string, string>;
  /** The profile menu, rendered on the server and passed through. */
  accountMenu?: React.ReactNode;
  /** The open review round, if any. */
  round?: ReviewRound | null;
}) {
  const {
    project,
    role,
    versions,
    messages,
    members,
    threads,
    quota,
    variants,
  } = props;
  const outOfQuota = quota !== null && quota.remaining <= 0;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [selectedId, setSelectedId] = useState<string | null>(
    props.initialVersionId,
  );
  const [htmlCache, setHtmlCache] = useState<Record<string, string>>(
    props.initialVersionId && props.initialHtml
      ? { [props.initialVersionId]: props.initialHtml }
      : {},
  );
  const [srcCache, setSrcCache] = useState<Record<string, string>>(
    props.initialVersionId && props.initialSrc
      ? { [props.initialVersionId]: props.initialSrc }
      : {},
  );
  const [deviceSettings, setDeviceSettings] = useState(() =>
    readSettings(project.devices),
  );
  const teamDevices = useMemo(
    () => props.teamDevices ?? [],
    [props.teamDevices],
  );
  const view = useDeviceView(project.id, deviceSettings, teamDevices);
  const [moving, setMoving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const dsNames = props.allDesignSystemNames ?? {};
  const [dsId, setDsId] = useState<string | null>(
    project.design_system_id ?? null,
  );
  const [measure, setMeasure] = useState({ percent: 100, width: 0, height: 0 });
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [prompt, setPrompt] = useState("");
  const [variantCount, setVariantCount] = useState<1 | 2 | 3>(1);
  const [editMode, setEditMode] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { builds, now } = useBuilds(project.id, props.builds ?? []);
  const [logBuildId, setLogBuildId] = useState<string | null>(() =>
    versions.length === 0
      ? ((props.builds ?? []).find(
          (b) => b.status === "queued" || b.status === "building",
        )?.id ?? null)
      : null,
  );
  const buildRunning = builds.some(
    (b) => b.status === "queued" || b.status === "building",
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const chatEnd = useRef<HTMLDivElement>(null);

  const selected =
    versions.find((v) => v.id === selectedId) ?? versions[0] ?? null;
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
      notify.success(`Saved as v${saved.number}`);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Couldn't save your edits.",
        { action: { label: "Retry", onClick: saveEdits } },
      );
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
        .then(
          (url) =>
            !cancelled && setSrcCache((c) => ({ ...c, [selected.id]: url })),
        )
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
        if (!cancelled && data)
          setHtmlCache((c) => ({ ...c, [selected.id]: data.html }));
      });
    return () => {
      cancelled = true;
    };
  }, [selected, htmlCache, srcCache, supabase]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    const channel = supabase
      .channel(`studio-${project.id}`)
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, router]);

  // A prototype created from a description builds it straight away.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    if (!new URLSearchParams(window.location.search).has("start")) return;
    started.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    let stash: { prompt?: string; at?: number } | null = null;
    try {
      stash = JSON.parse(sessionStorage.getItem(START_PROMPT_KEY) ?? "null");
      sessionStorage.removeItem(START_PROMPT_KEY);
    } catch {}
    const text = stash?.prompt?.trim();
    if (!text || Date.now() - (stash?.at ?? 0) > 5 * 60_000) return;
    if (versions.length > 0 || messages.length > 0) return;
    setPrompt(text);
    void generate(undefined, text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const text = (override ?? prompt).trim();
    if (!text || busy || isImportedApp) return;
    setBusy(true);
    setElapsed(0);
    setError("");
    const startedAt = Date.now();
    try {
      const many = variantCount > 1;
      const res = await fetch(
        `/api/projects/${project.id}/${many ? "variants" : "generate"}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: text,
            baseVersionId: selected?.id ?? null,
            count: variantCount,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || `Request failed (${res.status})`);
      setPrompt("");
      if (!many) setSelectedId(data.versionId);
      router.refresh();
      // Only worth a toast if they looked away while it built.
      if (document.hidden || Date.now() - startedAt > 20_000)
        notify.success(
          many
            ? `${variantCount} variants ready to compare`
            : "New version ready",
        );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Fix from feedback: one build from the selected open comment threads.
  const [fixPick, setFixPick] = useState<string[]>([]);
  const [fixNote, setFixNote] = useState("");
  async function fixFromFeedback() {
    if (!fixPick.length || busy || isImportedApp) return;
    setBusy(true);
    setElapsed(0);
    setError("");
    try {
      const res = await fetch(`/api/projects/${project.id}/fix`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          threadIds: fixPick,
          note: fixNote.trim() || null,
          baseVersionId: selected?.id ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || `Request failed (${res.status})`);
      setSelectedId(data.versionId);
      setFixPick([]);
      setFixNote("");
      notify.success(`v${data.number} is ready`, {
        description: `Built from ${data.addressed} comment${data.addressed === 1 ? "" : "s"}${data.notified ? `; ${data.notified} reviewer${data.notified === 1 ? " was" : "s were"} told` : ""}.`,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      notify.error(err instanceof Error ? err.message : "That didn't work.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Run a server action. `key` lets the triggering button show its own loading state; `done`
   * is the success toast (with an optional Undo). Failures always show an error toast.
   */
  function run(action: () => Promise<void | Done>, key?: string, done?: Done) {
    setBusyKey(key ?? null);
    startTransition(async () => {
      try {
        const result = await action();
        const message = (result as Done | undefined) ?? done;
        router.refresh();
        if (typeof message === "string") notify.success(message);
        else if (message)
          notify.success(message.title, {
            undo: message.undo,
            action: message.action,
          });
      } catch (err) {
        notify.error(
          err instanceof Error ? err.message : "Something went wrong.",
        );
      } finally {
        setBusyKey(null);
      }
    });
  }
  const isBusy = (key: string) => pending && busyKey === key;

  // The review link depends on the host, which only the browser knows; work it out after mount
  // so server and client render the same HTML.
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => setHost(window.location.host), []);
  const reviewUrl = host
    ? reviewUrlFor(project.slug, host)
    : `/p/${project.slug}`;
  const isLive =
    project.published && selected && project.live_version_id === selected.id;

  return (
    <div className="flex h-screen flex-col">
      <header className="glass mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5">
        <Link
          href="/projects"
          aria-label="All prototypes"
          className="rounded-full p-1 hover:bg-stone-900/5"
        >
          <Mark size={26} />
        </Link>
        <label htmlFor="pname" className="sr-only">
          Prototype name
        </label>
        <input
          id="pname"
          defaultValue={project.name}
          readOnly={!isOwner}
          onBlur={(e) => {
            const input = e.target;
            const name = input.value.trim();
            if (!isOwner || name === project.name) return;
            if (!name) {
              input.value = project.name;
              return;
            }
            run(async () => {
              try {
                await renameProject(project.id, name);
              } catch (err) {
                input.value = project.name;
                throw err;
              }
            });
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
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
        <DevicePicker
          view={view}
          measure={measure}
          onOpenSettings={
            isOwner ? () => setDeviceSettingsOpen(true) : undefined
          }
        />
        <RotateButton view={view} />
        {isOwner && (
          <DeviceSettingsDialog
            open={deviceSettingsOpen}
            onOpenChange={setDeviceSettingsOpen}
            settings={deviceSettings}
            extra={teamDevices}
            onSave={async (next) => {
              const saved = await updateDeviceSettings(project.id, next);
              setDeviceSettings(saved);
              notify.success("Device settings saved");
            }}
          />
        )}
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
            onClick={() =>
              run(() => publishVersion(project.id, selected.id), "publish", {
                title: `v${selected.number} is live`,
                action: {
                  label: "Copy link",
                  onClick: () => copyWithToast(reviewUrl),
                },
              })
            }
          >
            {isLive ? <Check /> : <Rocket />}
            {isLive
              ? `v${selected.number} is live`
              : `Publish v${selected.number}`}
          </Button>
        )}
        {(role === "owner" || role === "editor") && selected && (
          <RequestReviewDialog
            projectId={project.id}
            version={{ id: selected.id, number: selected.number }}
            suggested={members
              .filter((m) => m.role !== "editor")
              .map((m) => m.email)}
            trigger={
              <Button variant="outline">
                <Send />
                Request review
              </Button>
            }
          />
        )}
        {isOwner && (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="More actions"
                title="More actions"
              >
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => copyWithToast(reviewUrl)}
                disabled={!project.published}
              >
                <Copy />
                Copy review link
              </DropdownMenuItem>
              {(props.teams?.length ?? 0) > 1 && (
                <DropdownMenuItem onSelect={() => setMoving(true)}>
                  <Users />
                  Move to team…
                </DropdownMenuItem>
              )}
              {props.teammates && (
                <DropdownMenuItem onSelect={() => setTransferring(true)}>
                  <UserRoundCheck />
                  Transfer ownership…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                <Trash2 />
                Delete prototype
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {props.accountMenu}
      </header>
      {props.teammates && (
        <TransferDialog
          open={transferring}
          onOpenChange={setTransferring}
          projectId={project.id}
          projectName={project.name}
          ownerId={project.owner_id}
          teammates={props.teammates}
        />
      )}
      {props.teams && (
        <MoveToTeamDialog
          open={moving}
          onOpenChange={setMoving}
          projectId={project.id}
          currentTeamId={project.team_id ?? null}
          teams={props.teams}
        />
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              All of its versions, variants and comments go with it. This
              can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run(() => deleteProject(project.id), "delete")}
            >
              Delete prototype
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        {variants.length > 0 ? (
          <VariantCompare
            variants={variants}
            busyKey={pending ? busyKey : null}
            onKeep={(v) =>
              run(async () => {
                const kept = await keepVariant(project.id, v.id);
                setSelectedId(kept.versionId);
                return `Kept variant ${v.position} as v${kept.number}`;
              }, `keep-${v.id}`)
            }
            onDiscard={() =>
              run(
                () => discardVariants(project.id, variants[0].group_id),
                "discard",
                "Variants discarded",
              )
            }
          />
        ) : (
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-card/80 bg-card/40 p-4">
            <div className="mb-3 flex items-center gap-2">
              {selected && (
                <Badge>
                  {editMode
                    ? `Editing v${selected.number}`
                    : `v${selected.number}`}
                </Badge>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
                {editMode
                  ? "Click an element to edit it. Links and buttons are paused while editing."
                  : selected?.summary}
              </span>
              {hasPreview && view.scale !== "dynamic" && (
                <span className="hidden text-xs tabular-nums text-stone-500 md:inline">
                  {view.scale === "fit" ? `Fit · ${measure.percent}%` : "100%"}
                </span>
              )}
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
                <Button
                  size="sm"
                  aria-pressed={editMode}
                  onClick={() => (editMode ? exitEdit() : setEditMode(true))}
                >
                  {editMode ? <X /> : <PencilRuler />}
                  {editMode ? "Exit editing" : "Edit visually"}
                </Button>
              )}
            </div>
            {presenting && hasPreview && (
              <PresentControls onExit={() => setPresenting(false)} />
            )}
            <div
              className={cn(
                "flex min-h-0 w-full flex-1 flex-col",
                !hasPreview &&
                  "overflow-hidden rounded-3xl border border-stone-200 bg-card",
                presenting && hasPreview && PRESENT_FRAME_CLASS,
              )}
            >
              {hasPreview ? (
                <DeviceStage
                  view={view}
                  presenting={presenting}
                  onMeasure={setMeasure}
                >
                  {src ? (
                    <PrototypeFrame
                      src={src}
                      title={`${project.name} v${selected?.number}`}
                    />
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
                      <PrototypeFrame
                        html={html}
                        title={`${project.name} v${selected?.number}`}
                      />
                    )
                  ) : null}
                </DeviceStage>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center text-[13px] text-stone-500">
                  {selected ? (
                    <Spinner />
                  ) : (
                    <>
                      <div
                        aria-hidden="true"
                        className="grid size-12 place-items-center rounded-2xl bg-glow-soft text-raspberry-700"
                      >
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
                <BuildLog
                  buildId={logBuildId}
                  onClose={() => setLogBuildId(null)}
                />
              </div>
            )}
          </main>
        )}

        {editMode ? (
          <aside
            aria-label="Visual editor"
            className="glass flex w-[320px] shrink-0 xl:w-[360px] flex-col overflow-hidden rounded-[1.75rem]"
          >
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
            className="glass flex w-[340px] shrink-0 flex-col overflow-hidden rounded-[1.75rem] xl:w-[380px]"
          >
            <div className="border-b border-stone-100 p-3">
              <TabsList>
                {(
                  [
                    ["chat", "Chat", Sparkles, 0],
                    ["versions", "Versions", History, versions.length],
                    ["comments", "Comments", MessageSquare, openThreads],
                    ["share", "Share", Share2, 0],
                  ] as const
                ).map(([id, label, Icon, count]) => (
                  <TabsTrigger key={id} value={id} className="gap-1 px-1.5">
                    <Icon />
                    {label}
                    {id === "chat" && busy && tab !== "chat" && (
                      <span
                        className="size-1.5 animate-pulse rounded-full bg-raspberry-600"
                        aria-label="Building"
                      />
                    )}
                    {count > 0 && (
                      <span className="grid h-4 min-w-4 place-items-center rounded-full bg-foreground/8 px-1 text-[10px] font-semibold tabular-nums text-stone-600">
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
              {(quota?.plan === "free" || quota?.plan === "team") && (
                <div className="flex items-center gap-2 px-4 pt-3 text-[11px] text-stone-500">
                  {quota.plan === "free" ? (
                    <span>
                      {quota.remaining}/{quota.limit} free builds left
                    </span>
                  ) : (
                    <span className="rounded-full bg-raspberry-50 px-2 py-0.5 font-medium text-raspberry-800">
                      Team Pro
                    </span>
                  )}
                </div>
              )}
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.length === 0 && !busy && (
                  <div className="space-y-2">
                    <p className="text-[13px] text-stone-600">
                      Describe what to build, or start from one of these:
                    </p>
                    {STARTERS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPrompt(s)}
                        className="flex w-full gap-2.5 rounded-2xl border border-stone-200 bg-card p-3 text-left text-[13px] leading-snug text-stone-700 transition-colors hover:border-raspberry-200 hover:bg-raspberry-50/50 active:scale-[.99]"
                      >
                        <Sparkles
                          className="mt-0.5 size-3.5 shrink-0 text-raspberry-700"
                          aria-hidden="true"
                        />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m) => {
                  const v = m.version_id
                    ? versions.find((x) => x.id === m.version_id)
                    : null;
                  return m.role === "user" ? (
                    <div
                      key={m.id}
                      className="ml-8 rounded-3xl rounded-br-md border border-raspberry-100 bg-glow-soft px-3.5 py-2.5 text-[13px] leading-relaxed"
                    >
                      {m.content}
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      className="space-y-2 text-[13px] leading-relaxed text-stone-800"
                    >
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
                  <div
                    role="status"
                    className="flex items-start gap-2.5 rounded-2xl bg-glow-soft p-3 text-[13px] text-raspberry-800"
                  >
                    <Spinner className="mt-0.5 shrink-0" />
                    <span>
                      {variantCount > 1
                        ? `Building ${variantCount} variants`
                        : `Building ${selected ? `on v${selected.number}` : "v1"}`}
                      … {elapsed}s
                      <span className="block text-xs text-raspberry-800/70">
                        Larger prototypes can take a minute or two.
                      </span>
                    </span>
                  </div>
                )}
                <div ref={chatEnd} />
              </div>
              <form
                onSubmit={generate}
                className="border-t border-stone-100 p-3"
              >
                {isImportedApp && (
                  <p className="mb-2 flex gap-2 rounded-2xl bg-secondary p-3 text-xs text-stone-700">
                    <Boxes
                      className="mt-px size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {selected?.source === "github" && props.source
                      ? `v${selected?.number} was built from GitHub, so prompts can't change it yet. Push to ${props.source.branch} for the next version, or pick a prompt-built version to keep working with AI.`
                      : `v${selected?.number} is an imported app, so prompts can't change it yet. Import a new zip for the next version, or pick a generated version to build on.`}
                  </p>
                )}
                <label htmlFor="prompt" className="sr-only">
                  {versions.length
                    ? `Describe a change to v${selected?.number ?? ""}`
                    : "Describe your prototype"}
                </label>
                <div className="rounded-3xl border border-stone-200 bg-card p-1.5 transition-[border-color,box-shadow] focus-within:border-raspberry-600 focus-within:ring-4 focus-within:ring-raspberry-100">
                  <textarea
                    id="prompt"
                    rows={3}
                    maxLength={MAX_PROMPT}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                        generate();
                    }}
                    placeholder={
                      versions.length
                        ? `Describe a change to v${selected?.number ?? ""}…`
                        : "A dispatch board for field techs…"
                    }
                    className="block w-full resize-none bg-transparent px-2.5 pt-1.5 text-[13px] leading-relaxed outline-none placeholder:text-stone-400"
                  />
                  <div className="flex items-center gap-1.5">
                    {(props.designSystems?.length ?? 0) > 0 && (
                      <Select
                        value={dsId ?? "none"}
                        disabled={busy}
                        onValueChange={async (v) => {
                          const next = v === "none" ? null : v;
                          const prev = dsId;
                          setDsId(next);
                          try {
                            await setProjectDesignSystem(project.id, next);
                            notify.info(
                              next
                                ? `Next build uses ${props.designSystems!.find((d) => d.id === next)?.name}`
                                : "Next build uses no design system",
                              "Earlier versions keep their look.",
                            );
                          } catch (e) {
                            setDsId(prev);
                            notify.error(
                              e instanceof Error
                                ? e.message
                                : "Couldn't change it.",
                            );
                          }
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label="Design system"
                          title="The design system builds follow"
                          className="max-w-40 border-transparent bg-secondary shadow-none hover:border-transparent"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {props.designSystems!.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              <Dots colors={d.colors} />
                              {d.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="none">
                            <Sparkles className="size-4 text-stone-500" />
                            No design system
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Select
                      value={String(variantCount)}
                      onValueChange={(v) =>
                        setVariantCount(Number(v) as 1 | 2 | 3)
                      }
                      disabled={busy}
                    >
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
                      aria-label={
                        variantCount > 1
                          ? "Generate variants"
                          : versions.length
                            ? "Update prototype"
                            : "Build prototype"
                      }
                      title={
                        variantCount > 1
                          ? "Generate variants"
                          : versions.length
                            ? "Update prototype"
                            : "Build prototype"
                      }
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
                    <p className="font-semibold">
                      You&apos;ve used this month&apos;s free builds.
                    </p>
                    <p className="mt-0.5 text-xs text-stone-700">
                      Pro is $20/month with $10 of AI usage included.
                    </p>
                    <form
                      action="/api/billing/checkout"
                      method="post"
                      className="mt-2"
                    >
                      <Button variant="default" size="sm" type="submit">
                        <Sparkles />
                        Upgrade to Pro
                      </Button>
                    </form>
                  </div>
                )}
                {outOfQuota &&
                  (quota?.plan === "pro" || quota?.plan === "team") &&
                  !error && (
                    <p className="mt-2 text-xs text-stone-600">
                      You&apos;ve hit the daily safety limit of {quota.limit}{" "}
                      builds. It frees up on a rolling 24-hour basis.
                    </p>
                  )}
                {error && (
                  <p role="alert" className="mt-2 text-xs text-red-700">
                    {error}
                  </p>
                )}
              </form>
            </TabsContent>
            {tab !== "chat" && (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TabsContent value="versions" className="space-y-5 p-4">
                  {(props.source || builds.length > 0) && (
                    <div className="space-y-2">
                      {props.source && (
                        <SourceCard
                          source={props.source}
                          isOwner={isOwner}
                          running={buildRunning}
                          latest={builds[0]}
                          now={now}
                          onBuilt={setLogBuildId}
                        />
                      )}
                      <BuildList
                        projectId={project.id}
                        builds={builds}
                        now={now}
                        onShowLog={setLogBuildId}
                        onBuilt={setLogBuildId}
                      />
                    </div>
                  )}

                  <section aria-label="Versions" className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <Eyebrow>Versions</Eyebrow>
                      <ImportDialog
                        projectId={project.id}
                        onImported={(id) => setSelectedId(id)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-mr-2 ml-auto h-7 text-stone-600"
                          >
                            <Upload />
                            Import
                          </Button>
                        }
                      />
                    </div>
                    {versions.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center">
                        <span
                          aria-hidden="true"
                          className="grid size-10 place-items-center rounded-2xl bg-glow-soft text-raspberry-700"
                        >
                          <History className="size-5" />
                        </span>
                        <p className="text-[13px] font-medium">
                          No versions yet
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {buildRunning
                            ? "Your first build is running."
                            : "Describe a prototype in the chat, or import one."}
                        </p>
                      </div>
                    ) : (
                      <ul className="space-y-1">
                        <AnimatePresence initial={false}>
                          {versions.map((v) => (
                            <VersionItem
                              key={v.id}
                              version={v}
                              designSystem={
                                v.design_system_id
                                  ? dsNames[v.design_system_id]
                                  : undefined
                              }
                              selected={v.id === selected?.id}
                              live={
                                v.id === project.live_version_id &&
                                project.published
                              }
                              canRestore={v.id !== versions[0]?.id}
                              restoring={isBusy(`restore-${v.id}`)}
                              disabled={pending}
                              onSelect={() => setSelectedId(v.id)}
                              onRestore={() =>
                                run(
                                  () => restoreVersion(project.id, v.id),
                                  `restore-${v.id}`,
                                  `Restored v${v.number} as a new version`,
                                )
                              }
                            />
                          ))}
                        </AnimatePresence>
                      </ul>
                    )}
                  </section>
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

                <TabsContent value="comments" className="space-y-1 p-3">
                  {props.round && (
                    <div className="mb-2">
                      <RoundCard
                        round={props.round}
                        projectId={project.id}
                        canClose={role === "owner" || role === "editor"}
                      />
                    </div>
                  )}
                  {threads.some((t) => t.status === "open") &&
                    !isImportedApp && (
                      <div className="flex items-center gap-2 px-1 pb-1 text-xs text-stone-600">
                        <span className="flex-1">
                          Pick comments to fix them in one build.
                        </span>
                        <button
                          type="button"
                          className="min-h-8 font-medium text-raspberry-700 hover:underline"
                          onClick={() => {
                            const open = threads
                              .filter((t) => t.status === "open")
                              .map((t) => t.id);
                            setFixPick(
                              fixPick.length === open.length
                                ? []
                                : open.slice(0, MAX_FIX_THREADS),
                            );
                          }}
                        >
                          {fixPick.length &&
                          fixPick.length ===
                            threads.filter((t) => t.status === "open").length
                            ? "Clear"
                            : "Select all open"}
                        </button>
                      </div>
                    )}
                  {threads.length === 0 && (
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center">
                      <span
                        aria-hidden="true"
                        className="grid size-10 place-items-center rounded-2xl bg-glow-soft text-raspberry-700"
                      >
                        <MessageSquare className="size-5" />
                      </span>
                      <p className="text-[13px] font-medium">No comments yet</p>
                      <p className="text-xs text-muted-foreground">
                        Reviewers pin comments on the published prototype from
                        the review link.
                      </p>
                    </div>
                  )}
                  <AnimatePresence initial={false}>
                    {threads
                      .slice()
                      .reverse()
                      .map((t, i) => {
                        const v = versions.find((x) => x.id === t.version_id);
                        return (
                          <motion.article
                            key={t.id}
                            {...listItem}
                            className="space-y-2 rounded-2xl p-3 transition-colors hover:bg-stone-900/[.03]"
                          >
                            <div className="flex items-center gap-1.5 text-xs">
                              {t.status === "open" && !isImportedApp && (
                                <input
                                  type="checkbox"
                                  aria-label={`Fix comment ${threads.length - i}`}
                                  className="size-4 accent-raspberry-700"
                                  checked={fixPick.includes(t.id)}
                                  disabled={
                                    !fixPick.includes(t.id) &&
                                    fixPick.length >= MAX_FIX_THREADS
                                  }
                                  onChange={(e) =>
                                    setFixPick((p) =>
                                      e.target.checked
                                        ? [...p, t.id]
                                        : p.filter((x) => x !== t.id),
                                    )
                                  }
                                />
                              )}
                              <span
                                className={cn(
                                  "grid size-5 place-items-center rounded-full text-[10px] font-bold text-white",
                                  t.status === "open"
                                    ? "btn-glow"
                                    : "bg-stone-400",
                                )}
                              >
                                {threads.length - i}
                              </span>
                              {v && <Badge>v{v.number}</Badge>}
                              {t.addressed_version_id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedId(t.addressed_version_id!)
                                  }
                                  className="rounded-full bg-raspberry-50 px-2 py-0.5 text-[11px] font-semibold text-raspberry-800 hover:bg-raspberry-100"
                                >
                                  Addressed in v
                                  {versions.find(
                                    (x) => x.id === t.addressed_version_id,
                                  )?.number ?? "?"}
                                </button>
                              )}
                              <span className="text-stone-500">
                                {t.status === "resolved" ? "Resolved" : "Open"}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-7"
                                onClick={async () => {
                                  await supabase
                                    .from("comment_threads")
                                    .update({
                                      status:
                                        t.status === "open"
                                          ? "resolved"
                                          : "open",
                                      resolved_at:
                                        t.status === "open"
                                          ? new Date().toISOString()
                                          : null,
                                    })
                                    .eq("id", t.id);
                                  router.refresh();
                                }}
                              >
                                {t.status === "open" ? (
                                  <CircleCheck />
                                ) : (
                                  <Undo2 />
                                )}
                                {t.status === "open" ? "Resolve" : "Reopen"}
                              </Button>
                            </div>
                            {t.comments
                              .slice()
                              .sort((a, b) =>
                                a.created_at.localeCompare(b.created_at),
                              )
                              .map((c) => (
                                <p
                                  key={c.id}
                                  className="text-[13px] leading-relaxed"
                                >
                                  <strong className="font-semibold">
                                    {authorLabel(c)}
                                  </strong>{" "}
                                  {c.body}
                                </p>
                              ))}
                          </motion.article>
                        );
                      })}
                  </AnimatePresence>
                  {fixPick.length > 0 && (
                    <div className="sticky bottom-0 space-y-2 rounded-2xl border border-raspberry-200 bg-card p-3 shadow-lg">
                      <label htmlFor="fix-note" className="sr-only">
                        Anything else for this build
                      </label>
                      <Textarea
                        id="fix-note"
                        rows={2}
                        value={fixNote}
                        onChange={(e) => setFixNote(e.target.value)}
                        placeholder="Anything else? (optional)"
                        className="text-[13px]"
                      />
                      <Button
                        className="w-full"
                        loading={busy}
                        disabled={busy || outOfQuota}
                        onClick={fixFromFeedback}
                      >
                        <WandSparkles />
                        Fix {fixPick.length} comment
                        {fixPick.length === 1 ? "" : "s"}
                      </Button>
                      <p className="text-center text-[11px] text-stone-500">
                        One build. If it fails, it isn&apos;t billed.
                      </p>
                    </div>
                  )}
                  {project.published && (
                    <Button asChild variant="ghost" size="sm" className="m-1">
                      <a href={reviewUrl} target="_blank" rel="noreferrer">
                        <ExternalLink />
                        Open the review page to reply
                      </a>
                    </Button>
                  )}
                </TabsContent>
              </div>
            )}
          </Tabs>
        )}
      </div>
    </div>
  );
}

const ACCESS = [
  {
    value: "invite",
    title: "Only people I invite",
    desc: "They sign in with an emailed link.",
    icon: Users,
  },
  {
    value: "password",
    title: "Anyone with the password",
    desc: "No account needed. Guests enter the password and a name.",
    icon: KeyRound,
  },
  {
    value: "public",
    title: "Anyone with the link",
    desc: "View only. Comments stay with invited reviewers.",
    icon: Globe,
  },
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
  run: Run;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "commenter" | "editor">(
    "commenter",
  );
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [address, setAddress] = useState(project.slug);
  const [addressError, setAddressError] = useState("");

  if (!isOwner) {
    return (
      <p className="p-4 text-[13px] text-stone-600">
        Only the owner can change who has access.
      </p>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <Eyebrow>Review link</Eyebrow>
        {project.published ? (
          <>
            <div className="flex gap-1.5">
              <Input
                readOnly
                value={reviewUrl}
                aria-label="Review link"
                className="text-xs text-stone-600"
              />
              <Button
                size="icon"
                aria-label={copied ? "Copied" : "Copy link"}
                title={copied ? "Copied" : "Copy link"}
                onClick={async () => {
                  await copyWithToast(reviewUrl);
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
              onClick={() =>
                run(() => unpublish(project.id), "unpublish", {
                  title: "Review link turned off",
                  undo: project.live_version_id
                    ? async () => {
                        await publishVersion(
                          project.id,
                          project.live_version_id!,
                        );
                        router.refresh();
                      }
                    : undefined,
                })
              }
            >
              Unpublish
            </Button>
          </>
        ) : (
          <p className="text-xs text-stone-600">
            Publish a version (top right) to get a review link.
          </p>
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
                notify.success(`Address changed to ${slug}`, {
                  action: {
                    label: "Copy link",
                    onClick: () =>
                      copyWithToast(reviewUrlFor(slug, window.location.host)),
                  },
                });
              } catch (err) {
                setAddressError(
                  err instanceof Error
                    ? err.message
                    : "Couldn't change the address.",
                );
              }
            }, "slug");
          }}
          className="flex items-center gap-1.5"
        >
          <label htmlFor="slug" className="sr-only">
            Subdomain
          </label>
          <div className="flex min-w-0 flex-1 items-center rounded-full border border-stone-200 bg-card pr-3 focus-within:border-raspberry-600 focus-within:ring-4 focus-within:ring-raspberry-100">
            <input
              id="slug"
              value={address}
              onChange={(e) => setAddress(e.target.value.toLowerCase())}
              maxLength={60}
              className="h-9 min-w-0 flex-1 rounded-full bg-transparent pl-3.5 text-[13px] outline-none"
            />
            <span className="shrink-0 text-xs text-stone-400">
              .realframe.app
            </span>
          </div>
          {address !== project.slug && (
            <Button
              variant="secondary"
              type="submit"
              loading={isBusy("slug")}
              disabled={pending}
            >
              Save
            </Button>
          )}
        </form>
        {addressError ? (
          <p role="alert" className="text-xs text-red-700">
            {addressError}
          </p>
        ) : (
          <p className="text-[11px] text-stone-500">
            Changing it breaks links you&apos;ve already shared.
          </p>
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
            const previous = project.access_mode;
            run(
              () => setAccessMode(project.id, value as Project["access_mode"]),
              "access",
              {
                title: {
                  invite: "Only invited people can open it",
                  password: "Anyone with the password can open it",
                  public: "Anyone with the link can view",
                }[value as Project["access_mode"]],
                undo: async () => {
                  await setAccessMode(project.id, previous);
                  router.refresh();
                },
              },
            );
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
              <Check
                className="ml-auto hidden size-4 shrink-0 text-raspberry-700 group-data-[state=checked]:block"
                aria-hidden="true"
              />
            </RadioGroupCard>
          ))}
        </RadioGroup>
        <div className="space-y-2 rounded-2xl bg-stone-900/[.03] p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = password;
              run(
                async () => {
                  await setProjectPassword(project.id, value);
                  setPassword("");
                },
                "password",
                project.has_password ? "Password changed" : "Password set",
              );
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
              placeholder={
                project.has_password
                  ? "Change the password"
                  : "Set a password (6+ characters)"
              }
            />
            <Button
              variant="secondary"
              type="submit"
              loading={isBusy("password")}
              disabled={pending}
            >
              <KeyRound />
              {project.has_password ? "Change" : "Set"}
            </Button>
          </form>
          <SwitchRow
            id="guest-comments"
            className="-mx-1"
            label="Password guests can comment"
            description="Guests add a name when they enter the password."
            checked={project.guest_comments !== false}
            loading={isBusy("guests")}
            disabled={pending && !isBusy("guests")}
            onCheckedChange={(on) =>
              run(() => setGuestComments(project.id, on), "guests")
            }
          />
        </div>
      </section>

      <section className="space-y-2">
        <Eyebrow>Invite people</Eyebrow>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = email;
            run(
              async () => {
                await inviteMember(project.id, value, role);
                setEmail("");
              },
              "invite",
              `Invited ${value.trim().toLowerCase()} as ${role}`,
            );
          }}
          className="space-y-1.5"
        >
          <label htmlFor="inv" className="sr-only">
            Email
          </label>
          <Input
            id="inv"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
          />
          <div className="flex gap-1.5">
            <Select
              value={role}
              onValueChange={(v) => setRole(v as typeof role)}
            >
              <SelectTrigger aria-label="Role" className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="commenter">Commenter</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              type="submit"
              loading={isBusy("invite")}
              disabled={pending}
            >
              <UserPlus />
              Invite
            </Button>
          </div>
        </form>
        <p className="text-[11px] text-stone-500">
          Send them the review link. They sign in with this email to get access.
        </p>
        {members.length > 0 && (
          <ul className="space-y-0.5">
            {members.map((m) => (
              <li
                key={m.email}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-0.5 hover:bg-stone-900/[.03]"
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-glow-soft text-[11px] font-semibold uppercase text-raspberry-800"
                >
                  {m.email[0]}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {m.email}
                </span>
                <Badge className="capitalize">{m.role}</Badge>
                <Button
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Remove ${m.email}`}
                  title={`Remove ${m.email}`}
                  loading={isBusy(`remove-${m.email}`)}
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => removeMember(project.id, m.email),
                      `remove-${m.email}`,
                      {
                        title: `Removed ${m.email}`,
                        undo: () =>
                          inviteMember(
                            project.id,
                            m.email,
                            m.role as "viewer" | "commenter" | "editor",
                          ),
                      },
                    )
                  }
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
    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-card/80 bg-card/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles
              className="size-4 text-raspberry-700"
              aria-hidden="true"
            />
            Compare {variants.length} variants
          </h2>
          <p className="truncate text-xs text-stone-600">
            “{variants[0].prompt}” · Keep one to make it the next version.
          </p>
        </div>
        <Button
          loading={busyKey === "discard"}
          disabled={anyBusy}
          onClick={onDiscard}
        >
          <X />
          Discard all
        </Button>
      </div>
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-3",
          variants.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2",
        )}
      >
        {variants.map((v) => (
          <section
            key={v.id}
            aria-label={`Variant ${v.position}`}
            className="flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-stone-200 bg-card shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]"
          >
            <div className="flex items-start gap-3 border-b border-stone-100 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">
                  Variant {v.position}
                </p>
                {v.summary && (
                  <p className="line-clamp-2 text-xs text-stone-600">
                    {v.summary}
                  </p>
                )}
              </div>
              <Button
                variant="default"
                size="sm"
                loading={busyKey === `keep-${v.id}`}
                disabled={anyBusy}
                onClick={() => onKeep(v)}
              >
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

const SOURCE_LABEL: Record<string, string> = {
  restore: "Restore",
  edit: "Visual edit",
  variant: "Variant",
  import: "Import",
  github: "GitHub",
};

function versionTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function VersionItem({
  version: v,
  selected,
  live,
  canRestore,
  restoring,
  disabled,
  onSelect,
  onRestore,
  designSystem,
}: {
  /** The design system this version was built with, if any. */
  designSystem?: string;
  version: VersionMeta;
  selected: boolean;
  live: boolean;
  canRestore: boolean;
  restoring: boolean;
  disabled: boolean;
  onSelect: () => void;
  onRestore: () => void;
}) {
  const summary = v.summary ?? "";
  const long = summary.length > 90;
  const body = (
    <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-700">
      {summary}
    </span>
  );
  return (
    <motion.li
      {...listItem}
      className={cn(
        "rounded-2xl transition-colors duration-[var(--duration-fast)]",
        selected
          ? "bg-glow-soft shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]"
          : "hover:bg-foreground/[.03]",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected || undefined}
        className="block w-full rounded-2xl p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold">v{v.number}</span>
          {live && (
            <Badge variant="success">
              <BadgeDot />
              Live
            </Badge>
          )}
          {v.source !== "ai" && (
            <Badge>{SOURCE_LABEL[v.source] ?? v.source}</Badge>
          )}
          {designSystem && (
            <Badge
              className="max-w-28 bg-blue-50 text-blue-800"
              title={`Built with ${designSystem}`}
            >
              <Layers />
              <span className="truncate">{designSystem}</span>
            </Badge>
          )}
          <span
            suppressHydrationWarning
            className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground"
          >
            {versionTime(v.created_at)}
          </span>
        </span>
        {summary &&
          (long ? (
            <Tooltip>
              <TooltipTrigger asChild>{body}</TooltipTrigger>
              <TooltipContent side="left">{summary}</TooltipContent>
            </Tooltip>
          ) : (
            body
          ))}
        {v.commit_sha ? (
          <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <GitCommitHorizontal className="size-3" aria-hidden="true" />
            <code className="font-mono">{v.commit_sha.slice(0, 7)}</code>
            {v.commit_author && (
              <span className="truncate">· {v.commit_author}</span>
            )}
          </span>
        ) : (
          v.prompt && (
            <span className="mt-1 block truncate text-[11px] text-muted-foreground">
              “{v.prompt}”
            </span>
          )
        )}
      </button>
      {selected && canRestore && (
        <div className="px-3 pb-3">
          <Button
            size="sm"
            loading={restoring}
            disabled={disabled}
            onClick={onRestore}
          >
            <RotateCcw />
            Restore as new version
          </Button>
        </div>
      )}
    </motion.li>
  );
}
