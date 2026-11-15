"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_POINTED, pointedName } from "@/lib/pointing";
import { useIsLarge } from "@/lib/use-media";
import { FailureCard } from "@/components/builds/FailureCard";
import { isFailureMessage } from "@/lib/failures";
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
  GitFork,
  History,
  KeyRound,
  LayoutGrid,
  Layers,
  MessageSquare,
  MessageSquarePlus,
  MousePointer2,
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
import {
  PrototypeFrame,
  type Pin,
  type SelectedElement,
} from "@/components/PrototypeFrame";
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
import { splitEmails } from "@/components/reviews/RequestReviewDialog";
import { requestReviewRound as raw_requestReviewRound } from "@/app/projects/review-actions";
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
const requestReviewRound = unwrapped(raw_requestReviewRound);
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

type PlanProgress = {
  title: string;
  status: "pending" | "running" | "done" | "failed";
  summary?: string;
};
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
  // Phones only: whether the panel drawer is open.
  // Phones only: the closed drawer is hidden, so it must not take focus or clicks.
  const large = useIsLarge();
  const [panelOpen, setPanelOpen] = useState(versions.length === 0);
  const [sharing, setSharing] = useState(false);
  // Links from the Inbox open a version (?v=) and a panel tab (?tab=).
  const fromLink = useRef(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const v = url.searchParams.get("v");
    const t = url.searchParams.get("tab");
    if (!v && !t) return;
    if (v && versions.some((x) => x.id === v)) setSelectedId(v);
    if (t === "comments" || t === "versions" || t === "chat") {
      setTab(t);
      setPanelOpen(true);
      fromLink.current = Boolean(v && v !== selectedId);
    }
    url.searchParams.delete("v");
    url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A new or picked version closes the drawer so the preview shows it.
  const shownVersion = useRef(selectedId);
  useEffect(() => {
    if (shownVersion.current === selectedId) return;
    shownVersion.current = selectedId;
    if (fromLink.current) {
      fromLink.current = false;
      return;
    }
    setPanelOpen(false);
  }, [selectedId]);
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setPanelOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen]);
  const [prompt, setPrompt] = useState("");
  const [variantCount, setVariantCount] = useState<1 | 2 | 3>(1);
  const [editMode, setEditMode] = useState(false);
  // Commenting from the studio: pin mode on the version on screen.
  const [commentMode, setCommentMode] = useState(false);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  const [posting, setPosting] = useState(false);
  // Point and prompt: elements picked in the preview go out with the next request.
  const [selectMode, setSelectMode] = useState(false);
  const [copying, setCopying] = useState(false);
  const [targets, setTargets] = useState<SelectedElement[]>([]);
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
  // Planned builds: the steps of the build in progress, shown as a live checklist.
  const [plan, setPlan] = useState<PlanProgress[] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const stopRequested = useRef(false);
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
  const pins: Pin[] = threads
    .map((t, i) => ({ t, n: i + 1 }))
    .filter(({ t }) => t.version_id === selected?.id && t.status === "open")
    .map(({ t, n }) => ({ id: t.id, n, x: t.x, y: t.y, status: t.status }));

  function pickElement(el: SelectedElement) {
    setTargets((cur) =>
      el.shift
        ? cur.some((t) => t.selector === el.selector)
          ? cur
          : [...cur, el].slice(0, MAX_POINTED)
        : [el],
    );
    setTab("chat");
    if (!large) {
      // Phones: one tap picks it and opens the chat.
      setSelectMode(false);
      setPanelOpen(true);
    }
    requestAnimationFrame(() => document.getElementById("prompt")?.focus());
  }

  // GitHub and uploaded builds can't take prompts; an AI copy of one can.
  async function makeAiCopy() {
    if (!selected || copying) return;
    setCopying(true);
    setBusy(true);
    setElapsed(0);
    setTab("chat");
    try {
      const res = await fetch(`/api/projects/${project.id}/ai-copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId: selected.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.versionId) {
        setSelectedId(data.versionId);
        notify.success(`v${data.number} is ready to change with prompts`);
      }
    } finally {
      setCopying(false);
      setBusy(false);
      router.refresh();
    }
  }

  function startSelecting() {
    setEditMode(false);
    setCommentMode(false);
    setDraft(null);
    setSelectMode(true);
    setPanelOpen(false);
  }

  function startCommenting() {
    setSelectMode(false);
    setEditMode(false);
    setDraft(null);
    setCommentMode(true);
    setPanelOpen(false);
  }

  async function postComment(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draft || !draftText.trim() || !selected) return;
    setPosting(true);
    const { error: err } = await supabase.rpc("create_thread", {
      p_project: project.id,
      p_version: selected.id,
      p_x: draft.x,
      p_y: draft.y,
      p_body: draftText.trim(),
    });
    setPosting(false);
    if (err)
      return notify.error("Couldn't post the comment.", {
        description: err.message,
      });
    setDraft(null);
    setDraftText("");
    notify.success(`Comment added to v${selected.number}`);
    setTab("comments");
    router.refresh();
  }

  // C starts commenting, Esc stops it, unless someone is typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "Escape" && (commentMode || draft || selectMode)) {
        setCommentMode(false);
        setDraft(null);
        setSelectMode(false);
      } else if (
        (e.key === "c" || e.key === "C") &&
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        selected &&
        !editMode
      ) {
        e.preventDefault();
        setDraft(null);
        setCommentMode((m) => !m);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commentMode, draft, selected, editMode, selectMode]);
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

  async function generate(
    e?: React.FormEvent,
    override?: string,
    opts: { smaller?: boolean } = {},
  ) {
    e?.preventDefault();
    const text = (override ?? prompt).trim();
    if (!text || busy || isImportedApp) return;
    setBusy(true);
    setElapsed(0);
    setError("");
    setPlan(null);
    setStopping(false);
    stopRequested.current = false;
    const startedAt = Date.now();
    const many = variantCount > 1;
    try {
      if (many) await runVariants(text);
      else await runPlanned(text, opts.smaller);
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
      setPlanning(false);
      setStopping(false);
      setPlan(null);
    }
  }

  async function runVariants(text: string) {
    const res = await fetch(`/api/projects/${project.id}/variants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: text,
        baseVersionId: selected?.id ?? null,
        count: variantCount,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(data.error || `Request failed (${res.status})`);
    setPrompt("");
    router.refresh();
  }

  /**
   * Plan, then build step by step: the server breaks the request into ordered steps and
   * each one is built on top of the last, one request per step.
   */
  async function runPlanned(text: string, smaller = false) {
    setPlanning(true);
    const res = await fetch(`/api/projects/${project.id}/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: text,
        baseVersionId: selected?.id ?? null,
        smaller,
        targets: targets.map((t) => ({
          label: t.label,
          tag: t.tag,
          selector: t.selector,
          html: t.html ?? "",
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPlanning(false);
    if (!res.ok)
      throw new Error(data.error || `Request failed (${res.status})`);
    setPrompt("");
    setTargets([]);
    setSelectMode(false);
    router.refresh(); // shows the prompt in the chat
    const runId = data.runId as string;
    const steps: PlanProgress[] = (data.steps as { title: string }[]).map(
      (s) => ({ title: s.title, status: "pending" }),
    );
    const mark = (i: number, patch: Partial<PlanProgress>) => {
      steps[i] = { ...steps[i], ...patch };
      setPlan([...steps]);
    };
    setPlan([...steps]);

    for (let i = 0; i < steps.length; i++) {
      if (stopRequested.current) {
        const stop = await fetch(`/api/projects/${project.id}/plan/${runId}`, {
          method: "DELETE",
        });
        const out = await stop.json().catch(() => ({}));
        if (out.versionId) setSelectedId(out.versionId);
        router.refresh();
        return;
      }
      mark(i, { status: "running" });
      const step = await fetch(`/api/projects/${project.id}/plan/${runId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ index: i }),
      });
      const out = await step.json().catch(() => ({}));
      if (!step.ok) {
        mark(i, { status: "failed" });
        // Earlier steps are saved as a version even when a later one fails.
        if (out.versionId) setSelectedId(out.versionId);
        router.refresh();
        throw new Error(
          out.partial
            ? `Step ${i + 1} failed, so the first ${i} step${i === 1 ? " was" : "s were"} saved as v${out.number}. ${out.error ?? ""}`.trim()
            : out.error || `Request failed (${step.status})`,
        );
      }
      mark(i, { status: "done", summary: out.summary });
      if (out.done) {
        setSelectedId(out.versionId);
        router.refresh();
        return;
      }
    }
  }

  function requestStop() {
    stopRequested.current = true;
    setStopping(true);
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
    <div className="flex h-dvh flex-col">
      <header className="glass mx-2 mt-2 flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-1.5 lg:mx-3 lg:mt-3 lg:gap-2 lg:pl-3">
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
          className="h-8 min-w-0 flex-1 rounded-full border border-transparent px-2 text-sm font-semibold lg:max-w-56 lg:flex-none lg:px-2.5 hover:border-stone-200 focus:border-raspberry-600 focus:outline-none"
        />
        {project.published && live ? (
          <Badge variant="success" className="max-lg:hidden">
            <BadgeDot />v{live.number} live
            {selected &&
            selected.id !== live.id &&
            selected.number > live.number
              ? ` · v${selected.number} draft`
              : ""}
          </Badge>
        ) : (
          <Badge className="max-lg:hidden">Not published</Badge>
        )}
        <div className="flex-1 max-lg:hidden" />
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
        <Button asChild variant="ghost" className="max-lg:hidden">
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
        {(role === "owner" || role === "editor") && (
          <Button
            variant="default"
            onClick={() => setSharing(true)}
            disabled={!selected}
          >
            <Share2 />
            <span className="max-sm:sr-only">Share</span>
          </Button>
        )}
        {(isOwner || role === "editor" || project.published) && (
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
              <div className="lg:hidden">
                <DropdownMenuItem asChild>
                  <Link href={`/projects/${project.id}/canvas`}>
                    <LayoutGrid />
                    Canvas
                  </Link>
                </DropdownMenuItem>
                {project.published && (
                  <DropdownMenuItem asChild>
                    <a href={reviewUrl} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Open review page
                    </a>
                  </DropdownMenuItem>
                )}
                {isOwner && <DropdownMenuSeparator />}
              </div>
              {isOwner && (
                <>
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
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="max-lg:hidden">{props.accountMenu}</div>
        <ShareDialog
          open={sharing}
          onOpenChange={setSharing}
          project={project}
          selected={selected}
          live={live}
          isOwner={isOwner}
          canBuild={role === "owner" || role === "editor"}
          members={members}
          reviewUrl={reviewUrl}
          pending={pending}
          isBusy={isBusy}
          run={run}
        />
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

      <div className="flex min-h-0 flex-1 gap-3 p-2 lg:p-3">
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
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-card/80 bg-card/40 p-2 lg:p-4">
            <div className="mb-2 flex items-center gap-2 lg:mb-3">
              {selected && (
                <Badge>
                  {editMode
                    ? `Editing v${selected.number}`
                    : `v${selected.number}`}
                </Badge>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-stone-500 max-sm:invisible">
                {editMode
                  ? "Click an element to edit it. Links and buttons are paused while editing."
                  : commentMode
                    ? `Click anywhere on v${selected?.number} to pin a comment. Esc to cancel.`
                    : selectMode
                      ? "Click an element to point at it. Shift-click to add more."
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
                  <span className="max-sm:sr-only">Full screen</span>
                </Button>
              )}
              {html && !editMode && !isImportedApp && (
                <Button
                  size="sm"
                  variant={selectMode ? "default" : "ghost"}
                  aria-pressed={selectMode}
                  title={
                    selectMode
                      ? "Stop selecting (Esc)"
                      : "Point at an element, then describe the change"
                  }
                  onClick={() =>
                    selectMode ? setSelectMode(false) : startSelecting()
                  }
                >
                  {selectMode ? <X /> : <MousePointer2 />}
                  <span className="max-sm:sr-only">
                    {selectMode ? "Done selecting" : "Select"}
                  </span>
                </Button>
              )}
              {hasPreview && !editMode && (
                <Button
                  size="sm"
                  variant={commentMode ? "default" : "ghost"}
                  aria-pressed={commentMode}
                  aria-keyshortcuts="C"
                  title={commentMode ? "Stop commenting (Esc)" : "Comment (C)"}
                  onClick={() =>
                    commentMode ? setCommentMode(false) : startCommenting()
                  }
                  className="max-lg:hidden"
                >
                  {commentMode ? <X /> : <MessageSquarePlus />}
                  {commentMode ? "Click to pin" : "Comment"}
                </Button>
              )}
              {html && (
                <Button
                  size="sm"
                  aria-pressed={editMode}
                  onClick={() => (editMode ? exitEdit() : setEditMode(true))}
                >
                  {editMode ? <X /> : <PencilRuler />}
                  <span className="max-sm:sr-only">
                    {editMode ? "Exit editing" : "Edit visually"}
                  </span>
                </Button>
              )}
            </div>
            {presenting && hasPreview && (
              <PresentControls onExit={() => setPresenting(false)} />
            )}
            {draft && selected && (
              <form
                onSubmit={postComment}
                className="absolute bottom-6 left-1/2 z-20 w-[min(420px,92%)] -translate-x-1/2 space-y-2.5 rounded-3xl border border-border bg-card p-3.5 shadow-[0_30px_70px_-30px_rgba(28,25,23,.45)]"
              >
                <label
                  htmlFor="studio-comment"
                  className="block text-[13px] font-semibold"
                >
                  New comment on v{selected.number}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · the version on screen
                  </span>
                </label>
                <Textarea
                  id="studio-comment"
                  autoFocus
                  rows={3}
                  maxLength={5000}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                      postComment(e);
                  }}
                  placeholder="What should change here?"
                  className="field-sizing-fixed resize-none"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <span className="mr-auto text-[11px] text-muted-foreground">
                    Shows on the review link too
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDraft(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    loading={posting}
                    disabled={!draftText.trim()}
                  >
                    <Send />
                    Post
                  </Button>
                </div>
              </form>
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
                      commentMode={commentMode}
                      pins={pins}
                      onPick={(x, y) => {
                        setDraft({ x, y });
                        setCommentMode(false);
                      }}
                      onSelectPin={() => {
                        setTab("comments");
                        setPanelOpen(true);
                      }}
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
                        editMode={selectMode}
                        onSelectElement={pickElement}
                        commentMode={commentMode}
                        pins={pins}
                        onPick={(x, y) => {
                          setDraft({ x, y });
                          setCommentMode(false);
                        }}
                        onSelectPin={() => {
                          setTab("comments");
                          setPanelOpen(true);
                        }}
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
                        : "Your prototype will appear here. Describe it in Chat to build v1."}
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
            className="glass flex shrink-0 flex-col overflow-hidden rounded-[1.75rem] max-lg:fixed max-lg:inset-x-2 max-lg:bottom-2 max-lg:z-40 max-lg:h-[45dvh] lg:w-[320px] xl:w-[360px]"
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
          <>
            {/* Phones: the panel is a drawer over the preview. */}
            <div
              aria-hidden="true"
              onClick={() => setPanelOpen(false)}
              className={cn(
                "fixed inset-0 z-30 bg-stone-950/30 backdrop-blur-[2px] transition-opacity duration-(--duration-base) lg:hidden dark:bg-black/60",
                panelOpen ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            />
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as Tab)}
              aria-label="Project panel"
              className={cn(
                "glass flex shrink-0 flex-col overflow-hidden rounded-[1.75rem] lg:w-[340px] xl:w-[380px]",
                "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:h-[88dvh] max-lg:rounded-b-none max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-24px_60px_-30px_rgba(0,0,0,.5)] max-lg:transition-transform max-lg:duration-(--duration-slow) max-lg:ease-(--ease-out)",
                !panelOpen &&
                  "max-lg:pointer-events-none max-lg:translate-y-full",
              )}
              {...(!panelOpen && !large ? { inert: true } : {})}
            >
              <div className="flex items-center gap-2 border-b border-stone-100 py-2 pl-4 pr-2 lg:hidden">
                <h2 className="flex-1 text-[15px] font-semibold">
                  {
                    {
                      chat: "Chat",
                      versions: "Versions",
                      comments: "Comments",
                      share: "Share",
                    }[tab]
                  }
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setPanelOpen(false)}
                  aria-label="Close"
                  className="lg:hidden"
                >
                  <X />
                </Button>
              </div>
              <div className="border-b border-stone-100 p-3 max-lg:hidden">
                <TabsList>
                  {(
                    [
                      ["chat", "Chat", Sparkles, 0],
                      ["versions", "Versions", History, versions.length],
                      ["comments", "Comments", MessageSquare, openThreads],
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

              <TabsContent
                value="chat"
                className="flex min-h-0 flex-1 flex-col"
              >
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
                  {messages.map((m, i) => {
                    const v = m.version_id
                      ? versions.find((x) => x.id === m.version_id)
                      : null;
                    if (m.role !== "user" && isFailureMessage(m.content)) {
                      const asked =
                        messages
                          .slice(0, i)
                          .reverse()
                          .find((x) => x.role === "user")?.content ?? null;
                      return (
                        <FailureCard
                          key={m.id}
                          content={m.content}
                          prompt={asked}
                          latest={i === messages.length - 1}
                          busy={busy}
                          onRetry={({ smaller }) =>
                            asked && generate(undefined, asked, { smaller })
                          }
                          onEdit={() => {
                            if (!asked) return;
                            setPrompt(asked);
                            requestAnimationFrame(() =>
                              document.getElementById("prompt")?.focus(),
                            );
                          }}
                        />
                      );
                    }
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
                        <p className="whitespace-pre-line">{m.content}</p>
                        {v && (
                          <Button size="sm" onClick={() => setSelectedId(v.id)}>
                            <History />v{v.number}
                            {v.id === project.live_version_id ? " · Live" : ""}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {busy && plan && plan.length > 1 && (
                    <PlanChecklist
                      steps={plan}
                      elapsed={elapsed}
                      stopping={stopping}
                      onStop={requestStop}
                    />
                  )}
                  {busy && !(plan && plan.length > 1) && (
                    <div
                      role="status"
                      className="flex items-start gap-2.5 rounded-2xl bg-glow-soft p-3 text-[13px] text-raspberry-800"
                    >
                      <Spinner className="mt-0.5 shrink-0" />
                      <span>
                        {copying
                          ? `Making an AI copy of v${selected?.number}`
                          : planning
                            ? "Planning the build"
                            : variantCount > 1
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
                      <span className="min-w-0 flex-1 space-y-2">
                        <span className="block">
                          {selected?.source === "github" && props.source
                            ? `v${selected?.number} came from GitHub, so prompts change a copy of it. Pushes to ${props.source.branch} still arrive as their own versions.`
                            : `v${selected?.number} is an uploaded build, so prompts change a copy of it.`}
                        </span>
                        {(role === "owner" || role === "editor") && (
                          <Button
                            type="button"
                            size="sm"
                            loading={copying}
                            disabled={busy}
                            onClick={makeAiCopy}
                          >
                            <GitFork />
                            Make an AI copy of v{selected?.number}
                          </Button>
                        )}
                      </span>
                    </p>
                  )}
                  {targets.length > 0 && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      {targets.map((t) => (
                        <span
                          key={t.selector}
                          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-raspberry-200 bg-raspberry-50 pl-2.5 pr-1 text-xs font-semibold text-raspberry-800"
                        >
                          <MousePointer2
                            className="size-3"
                            aria-hidden="true"
                          />
                          <span className="max-w-40 truncate">
                            {pointedName(t)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Stop pointing at ${pointedName(t)}`}
                            onClick={() =>
                              setTargets((cur) =>
                                cur.filter((x) => x.selector !== t.selector),
                              )
                            }
                            className="grid size-5 place-items-center rounded-full hover:bg-raspberry-100"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                      {selectMode && targets.length < MAX_POINTED && (
                        <span className="text-[11px] text-muted-foreground max-lg:hidden">
                          Shift-click to add more
                        </span>
                      )}
                    </div>
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
                      <Kbd className="ml-auto max-lg:invisible">⌘↵</Kbd>
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
                  {error &&
                    !(
                      messages.length > 0 &&
                      isFailureMessage(messages[messages.length - 1].content)
                    ) && (
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

                  <TabsContent value="comments" className="space-y-1 p-3">
                    {versions.length > 0 && (
                      <Button
                        variant="outline"
                        className="mb-2 w-full"
                        onClick={startCommenting}
                        disabled={!selected}
                      >
                        <MessageSquarePlus />
                        Add a comment on v{selected?.number}
                      </Button>
                    )}
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
                        <p className="text-[13px] font-medium">
                          No comments yet
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Add a comment to pin one on the version on screen.
                          Reviewers do the same from the review link.
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
                                  {t.status === "resolved"
                                    ? "Resolved"
                                    : "Open"}
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
          </>
        )}
      </div>

      {/* Phones: a tab bar that opens the panel drawer on that tab. */}
      {commentMode && (
        <div className="glass mx-2 mb-2 flex shrink-0 rounded-full p-1.5 pb-[max(.375rem,env(safe-area-inset-bottom))] lg:hidden">
          <Button
            size="lg"
            className="flex-1"
            onClick={() => setCommentMode(false)}
          >
            <X />
            Tap a spot to pin · Cancel
          </Button>
        </div>
      )}
      {selectMode && (
        <div className="glass mx-2 mb-2 flex shrink-0 rounded-full p-1.5 pb-[max(.375rem,env(safe-area-inset-bottom))] lg:hidden">
          <Button
            size="lg"
            className="flex-1"
            onClick={() => setSelectMode(false)}
          >
            <X />
            Tap an element · Cancel
          </Button>
        </div>
      )}
      {!editMode && !commentMode && !selectMode && variants.length === 0 && (
        <nav
          aria-label="Project panel"
          className="glass mx-2 mb-2 flex shrink-0 items-center rounded-full p-1 pb-[max(.25rem,env(safe-area-inset-bottom))] lg:hidden"
        >
          {(
            [
              ["chat", "Chat", Sparkles, 0],
              ["versions", "Versions", History, versions.length],
              ["comments", "Comments", MessageSquare, openThreads],
              ["share", "Share", Share2, 0],
            ] as const
          ).map(([id, label, Icon, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (id === "share") return setSharing(true);
                setTab(id);
                setPanelOpen(true);
              }}
              aria-pressed={panelOpen && tab === id}
              className="relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-medium text-stone-600 aria-pressed:bg-foreground/[.07] aria-pressed:text-foreground"
            >
              <Icon className="size-[18px]" />
              {label}
              {id === "chat" && busy && (
                <span
                  className="absolute right-[calc(50%-16px)] top-2 size-2 animate-pulse rounded-full bg-raspberry-600"
                  aria-label="Building"
                />
              )}
              {count > 0 && id !== "versions" && (
                <span className="absolute right-[calc(50%-20px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-raspberry-600 px-1 text-[10px] font-semibold text-white">
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>
      )}
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

/**
 * One place to share: which version people see, who can open it, and whether
 * to ask for approval, finished by a single action ("Publish v4 and send").
 */
function ShareDialog({
  open,
  onOpenChange,
  project,
  selected,
  live,
  isOwner,
  canBuild,
  members,
  reviewUrl,
  pending,
  isBusy,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  selected: VersionMeta | null;
  live: VersionMeta | null;
  isOwner: boolean;
  canBuild: boolean;
  members: Member[];
  reviewUrl: string;
  pending: boolean;
  isBusy: (key: string) => boolean;
  run: Run;
}) {
  const router = useRouter();
  const selectedIsLive =
    project.published && !!selected && selected.id === project.live_version_id;
  const [makeLive, setMakeLive] = useState(true);
  const [approval, setApproval] = useState(false);
  const [emails, setEmails] = useState("");
  const [due, setDue] = useState("");
  const [rule, setRule] = useState<"all" | "any">("all");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const list = splitEmails(emails);
  const suggested = members
    .filter((m) => m.role !== "editor")
    .map((m) => m.email)
    .filter((e) => !list.includes(e));

  const publishing = isOwner && !!selected && !selectedIsLive && makeLive;
  const asking = approval && list.length > 0 && !!selected;
  const label =
    publishing && asking
      ? `Publish v${selected!.number} and send`
      : publishing
        ? `Publish v${selected!.number}`
        : asking
          ? `Send to ${list.length} reviewer${list.length === 1 ? "" : "s"}`
          : "Done";

  async function submit() {
    if (!publishing && !asking) return onOpenChange(false);
    setSending(true);
    try {
      if (publishing) await publishVersion(project.id, selected!.id);
      if (asking) {
        const res = await requestReviewRound({
          projectId: project.id,
          versionId: selected!.id,
          emails: list,
          note: note.trim() || undefined,
          dueAt: due ? new Date(`${due}T23:59:00`).toISOString() : null,
          rule,
        });
        notify.success(
          `${publishing ? `v${selected!.number} is live. ` : ""}Asked ${res.reviewers} reviewer${res.reviewers === 1 ? "" : "s"} to approve it`,
          {
            description:
              res.emailed === res.reviewers
                ? "They've been emailed the link."
                : "Email isn't set up for everyone, so send them the link too.",
            action: {
              label: "Copy link",
              onClick: () => copyWithToast(reviewUrl),
            },
          },
        );
      } else {
        notify.success(`v${selected!.number} is live`, {
          action: {
            label: "Copy link",
            onClick: () => copyWithToast(reviewUrl),
          },
        });
      }
      setApproval(false);
      setEmails("");
      setNote("");
      setDue("");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] gap-5 pb-0 [&>*]:min-w-0 max-sm:bottom-0 max-sm:top-auto max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share {project.name}</DialogTitle>
          <DialogDescription>
            Pick what people see, who can open it, and whether you want an
            approval.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <Eyebrow>What people see</Eyebrow>
          {selected ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-card px-3.5 py-2.5">
              <span className="text-[13px] font-semibold">
                v{selected.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-stone-600">
                {selected.summary || "Selected version"}
              </span>
              {selectedIsLive ? (
                <Badge variant="success">
                  <BadgeDot />
                  Live
                </Badge>
              ) : isOwner ? (
                <SwitchRow
                  id="share-make-live"
                  label={<span className="text-xs">Make live</span>}
                  checked={makeLive}
                  onCheckedChange={setMakeLive}
                  className="border-0 bg-transparent p-0"
                />
              ) : (
                <Badge>Draft</Badge>
              )}
            </div>
          ) : (
            <p className="text-xs text-stone-600">Build a version first.</p>
          )}
          <p className="text-[11px] text-stone-500">
            {live
              ? `Now live: v${live.number}. People on the link always see the live version.`
              : "Nothing is live yet, so the link doesn't work until you publish."}
            {!isOwner && " Only the owner can change what's live."}
          </p>
        </section>

        {(project.published || publishing) && (
          <section className="space-y-2">
            <Eyebrow>Link</Eyebrow>
            <div className="flex gap-1.5">
              <Input
                readOnly
                value={reviewUrl}
                aria-label="Review link"
                className="text-xs text-stone-600"
              />
              <Button
                variant="outline"
                onClick={() => copyWithToast(reviewUrl)}
              >
                <Copy />
                Copy
              </Button>
            </div>
          </section>
        )}

        {isOwner && (
          <SharePanel
            hideLink
            project={project}
            isOwner={isOwner}
            members={members}
            reviewUrl={reviewUrl}
            pending={pending}
            isBusy={isBusy}
            run={run}
          />
        )}

        {canBuild && selected && (
          <section className="space-y-3 rounded-2xl bg-stone-50 p-3.5">
            <SwitchRow
              id="share-approval"
              label="Ask for approval"
              description="Reviewers get an email and approve or ask for changes. Reviewers are free."
              checked={approval}
              onCheckedChange={setApproval}
              className="border-0 bg-transparent p-0"
            />
            {approval && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="share-reviewers">Reviewers</Label>
                  <Textarea
                    id="share-reviewers"
                    rows={2}
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    placeholder="maya@company.com, client@example.com"
                  />
                  {suggested.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggested.slice(0, 8).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() =>
                            setEmails((v) =>
                              v.trim() ? `${v.trim()}, ${m}` : m,
                            )
                          }
                          className="min-h-8 rounded-full bg-card px-3 text-xs text-stone-700 shadow-[inset_0_0_0_1px_var(--color-border)] hover:bg-stone-100"
                        >
                          + {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="share-due">Due (optional)</Label>
                    <Input
                      id="share-due"
                      type="date"
                      value={due}
                      onChange={(e) => setDue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="share-rule">Approved when</Label>
                    <Select
                      value={rule}
                      onValueChange={(v) => setRule(v as "all" | "any")}
                    >
                      <SelectTrigger id="share-rule">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone approves</SelectItem>
                        <SelectItem value="any">Anyone approves</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="share-note">Note (optional)</Label>
                  <Textarea
                    id="share-note"
                    rows={2}
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="What should they look at?"
                  />
                </div>
              </div>
            )}
          </section>
        )}

        <DialogFooter className="sticky bottom-0 -mx-5 border-t border-stone-100 bg-card px-5 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="mr-auto"
          >
            Close
          </Button>
          <Button
            variant="default"
            loading={sending}
            disabled={approval && list.length === 0 && !publishing}
            onClick={submit}
          >
            {asking ? <Send /> : publishing ? <Rocket /> : <Check />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SharePanel({
  project,
  isOwner,
  members,
  reviewUrl,
  pending,
  isBusy,
  run,
  hideLink = false,
}: {
  hideLink?: boolean;
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
    <div className={cn("space-y-6", hideLink ? "" : "p-4")}>
      {!hideLink && (
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
      )}

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

/** Live checklist for a planned build: each step's state, with a way to stop between steps. */
function PlanChecklist({
  steps,
  elapsed,
  stopping,
  onStop,
}: {
  steps: PlanProgress[];
  elapsed: number;
  stopping: boolean;
  onStop: () => void;
}) {
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-2.5 rounded-2xl bg-glow-soft p-3 text-[13px] text-raspberry-800"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          Step {Math.min(done + 1, steps.length)} of {steps.length} · {elapsed}s
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onStop}
          disabled={stopping}
          className="h-7 px-2 text-xs"
        >
          {stopping ? "Stopping after this step…" : "Stop"}
        </Button>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
              {s.status === "done" ? (
                <Check
                  className="size-4 text-raspberry-700"
                  aria-hidden="true"
                />
              ) : s.status === "running" ? (
                <Spinner className="size-3.5" />
              ) : s.status === "failed" ? (
                <X className="size-4 text-red-700" aria-hidden="true" />
              ) : (
                <span
                  className="size-2 rounded-full border border-raspberry-800/40"
                  aria-hidden="true"
                />
              )}
            </span>
            <span
              className={cn(
                "leading-snug",
                s.status === "pending" && "text-raspberry-800/60",
              )}
            >
              {s.title}
              {s.summary && (
                <span className="block text-xs text-raspberry-800/70">
                  {s.summary}
                </span>
              )}
              <span className="sr-only">
                {s.status === "done"
                  ? " (done)"
                  : s.status === "running"
                    ? " (in progress)"
                    : s.status === "failed"
                      ? " (failed)"
                      : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
