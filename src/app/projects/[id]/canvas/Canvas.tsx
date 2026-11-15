"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutTemplate,
  Maximize,
  Monitor,
  Route,
  Spline,
  Plus,
  PencilRuler,
  Smartphone,
  Tablet,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Mark } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PrototypeFrame,
  type FrameHandle,
} from "@/components/PrototypeFrame";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  arrowPath,
  crawl,
  layoutFlow,
  normalizeRoute,
  routesInSource,
  screenName,
  type Side,
} from "@/lib/flow";
import { Inspector, useVisualEditor } from "@/components/Inspector";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/types";
import { saveVisualEdit as raw_saveVisualEdit } from "../../actions";
import { unwrapped } from "@/lib/safe-action";

const saveVisualEdit = unwrapped(raw_saveVisualEdit);

export type Frame = {
  id: string;
  label: string;
  route: string;
  width: number;
  height: number;
  x: number;
  y: number;
  version_id: string | null;
};

export type Link = { from_route: string; to_route: string; label: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEVICES = [
  { label: "Desktop", width: 1280, height: 800, icon: Monitor },
  { label: "Tablet", width: 820, height: 1180, icon: Tablet },
  { label: "Phone", width: 390, height: 844, icon: Smartphone },
] as const;

const GAP = 120;
const HEADER = 34;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;

type Drag =
  | { kind: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { kind: "move"; id: string; sx: number; sy: number; ox: number; oy: number }
  | {
      kind: "resize";
      id: string;
      sx: number;
      sy: number;
      ow: number;
      oh: number;
    };

export function Canvas({
  project,
  frames: initialFrames,
  links: initialLinks = [],
  latest,
  accountMenu,
}: {
  accountMenu?: React.ReactNode;
  project: Project;
  frames: Frame[];
  links?: Link[];
  latest: {
    id: string;
    number: number;
    html: string;
    src?: string | null;
  } | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const board = useRef<HTMLDivElement>(null);
  const [frames, setFrames] = useState<Frame[]>(initialFrames);
  const [view, setView] = useState({ x: 80, y: 80, z: 0.35 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [showFlow, setShowFlow] = useState(true);
  const [mapping, setMapping] = useState<{
    device: (typeof DEVICES)[number];
    found: number;
  } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const crawler = useRef<FrameHandle>(null);
  const cancelMap = useRef(false);
  const editor = useVisualEditor(editing && !latest?.src ? latest?.html : null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // Keep local frames in sync when the server data changes (other collaborators, refreshes).
  useEffect(() => {
    if (!dragRef.current) setFrames(initialFrames);
  }, [initialFrames]);
  useEffect(() => setLinks(initialLinks), [initialLinks]);

  useEffect(() => {
    const channel = supabase
      .channel(`canvas-${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvas_frames",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          if (!dragRef.current) router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "canvas_links",
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          if (!dragRef.current) router.refresh();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, project.id, router]);

  const persist = useCallback(
    async (id: string, patch: Partial<Frame>) => {
      const { error } = await supabase
        .from("canvas_frames")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) setError(error.message);
    },
    [supabase],
  );

  const fit = useCallback(
    (list = frames) => {
      const el = board.current;
      if (!el || list.length === 0) return;
      const minX = Math.min(...list.map((f) => f.x));
      const minY = Math.min(...list.map((f) => f.y));
      const maxX = Math.max(...list.map((f) => f.x + f.width));
      const maxY = Math.max(...list.map((f) => f.y + f.height + HEADER));
      const r = el.getBoundingClientRect();
      const z = Math.max(
        MIN_ZOOM,
        Math.min(
          1,
          Math.min(
            (r.width - 120) / (maxX - minX),
            (r.height - 120) / (maxY - minY),
          ),
        ),
      );
      setView({
        z,
        x: (r.width - (maxX - minX) * z) / 2 - minX * z,
        y: (r.height - (maxY - minY) * z) / 2 - minY * z,
      });
    },
    [frames],
  );

  useEffect(() => {
    fit(initialFrames);
    // Fit once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function zoomAt(factor: number, cx?: number, cy?: number) {
    const r = board.current?.getBoundingClientRect();
    const px = cx ?? (r ? r.width / 2 : 0);
    const py = cy ?? (r ? r.height / 2 : 0);
    setView((v) => {
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.z * factor));
      return {
        z,
        x: px - ((px - v.x) * z) / v.z,
        y: py - ((py - v.y) * z) / v.z,
      };
    });
  }

  useEffect(() => {
    const el = board.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey)
        zoomAt(
          Math.exp(-e.deltaY * 0.01),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
    // Two fingers on the board pinch to zoom around their midpoint.
    let pinch: number | null = null;
    const span = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 2) {
        pinch = null;
        return;
      }
      e.preventDefault();
      const d = span(e.touches);
      if (pinch) {
        const r = el!.getBoundingClientRect();
        setDrag(null);
        zoomAt(
          d / pinch,
          (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
          (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top,
        );
      }
      pinch = d;
    }
    const endPinch = () => (pinch = null);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", endPinch);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", endPinch);
    };
  }, []);

  function onPointerMove(e: React.PointerEvent) {
    const d = drag;
    if (!d) return;
    if (d.kind === "pan")
      setView((v) => ({
        ...v,
        x: d.ox + e.clientX - d.sx,
        y: d.oy + e.clientY - d.sy,
      }));
    if (d.kind === "move") {
      const x = d.ox + (e.clientX - d.sx) / view.z;
      const y = d.oy + (e.clientY - d.sy) / view.z;
      setFrames((fs) =>
        fs.map((f) =>
          f.id === d.id ? { ...f, x: Math.round(x), y: Math.round(y) } : f,
        ),
      );
    }
    if (d.kind === "resize") {
      const width = Math.max(
        240,
        Math.min(3840, Math.round(d.ow + (e.clientX - d.sx) / view.z)),
      );
      const height = Math.max(
        240,
        Math.min(4000, Math.round(d.oh + (e.clientY - d.sy) / view.z)),
      );
      setFrames((fs) =>
        fs.map((f) => (f.id === d.id ? { ...f, width, height } : f)),
      );
    }
  }

  function onPointerUp() {
    const d = drag;
    setDrag(null);
    if (!d || d.kind === "pan") return;
    const f = frames.find((x) => x.id === d.id);
    if (!f) return;
    if (d.kind === "move") persist(f.id, { x: f.x, y: f.y });
    if (d.kind === "resize")
      persist(f.id, { width: f.width, height: f.height });
  }

  async function addFrames(
    devices: readonly { label: string; width: number; height: number }[],
    route = "",
  ) {
    const right = frames.length
      ? Math.max(...frames.map((f) => f.x + f.width)) + GAP
      : 0;
    let x = right;
    const rows = devices.map((d) => {
      const row = {
        project_id: project.id,
        label: route
          ? `${d.label} · ${route.replace(/^#\/?/, "") || "home"}`
          : d.label,
        route,
        width: d.width,
        height: d.height,
        x,
        y: 0,
      };
      x += d.width + GAP;
      return row;
    });
    const { data, error } = await supabase
      .from("canvas_frames")
      .insert(rows)
      .select("id, label, route, width, height, x, y, version_id");
    if (error) return setError(error.message);
    const next = [...frames, ...((data ?? []) as Frame[])];
    setFrames(next);
    fit(next);
  }

  async function removeFrame(id: string) {
    setFrames((fs) => fs.filter((f) => f.id !== id));
    if (active === id) {
      setActive(null);
      setEditing(false);
    }
    const { error } = await supabase
      .from("canvas_frames")
      .delete()
      .eq("id", id);
    if (error) setError(error.message);
  }

  /**
   * Flow map: walk the prototype in a hidden frame from its first screen, following every
   * in-app link, then add a frame per screen (in columns by how many taps away it is) and save
   * the links so the canvas draws arrows between them.
   */
  async function mapFlow(device: (typeof DEVICES)[number]) {
    if (!latest || mapping) return;
    setMapOpen(false);
    setError("");
    cancelMap.current = false;
    setMapping({ device, found: 0 });
    const report = async () => {
      for (let i = 0; i < 4; i++) {
        if (cancelMap.current) break;
        try {
          if (!crawler.current) throw new Error();
          return await crawler.current.links();
        } catch {
          await sleep(300);
        }
      }
      throw new Error("The prototype didn't answer.");
    };
    try {
      const result = await crawl(
        async (route) => {
          if (route !== null) {
            crawler.current?.navigate(route);
            // Let the app render the new screen.
            await sleep(550);
          }
          return report();
        },
        {
          seeds: latest.src ? [] : routesInSource(latest.html),
          max: 30,
          cancelled: () => cancelMap.current,
          onProgress: (found) =>
            setMapping((m) => (m ? { ...m, found } : m)),
        },
      );
      if (cancelMap.current) return;
      if (result.screens.length === 0)
        throw new Error("Couldn't load the prototype to map it.");

      // Screens that already have a frame at this size keep theirs.
      const have = new Set(
        frames
          .filter((f) => f.width === device.width && f.height === device.height)
          .map((f) => normalizeRoute(f.route)),
      );
      const right = frames.length
        ? Math.max(...frames.map((f) => f.x + f.width)) + GAP * 2
        : 0;
      const top = frames.length ? Math.min(...frames.map((f) => f.y)) : 0;
      const spots = layoutFlow(
        result.screens,
        device,
        { x: right, y: top },
        { x: Math.max(240, device.width * 0.6), y: HEADER + GAP },
      );
      const rows = result.screens
        .filter((sc) => !have.has(sc.route))
        .map((sc) => ({
          project_id: project.id,
          label: screenName(sc.route, sc.title || "Home"),
          route: sc.route,
          width: device.width,
          height: device.height,
          ...spots.get(sc.route)!,
        }));
      let added: Frame[] = [];
      if (rows.length) {
        const { data, error } = await supabase
          .from("canvas_frames")
          .insert(rows)
          .select("id, label, route, width, height, x, y, version_id");
        if (error) throw new Error(error.message);
        added = (data ?? []) as Frame[];
      }
      const nextLinks: Link[] = result.links.map((l) => ({
        from_route: l.from,
        to_route: l.to,
        label: l.label,
      }));
      const { error: delError } = await supabase
        .from("canvas_links")
        .delete()
        .eq("project_id", project.id);
      if (delError) throw new Error(delError.message);
      if (nextLinks.length) {
        const { error: insError } = await supabase
          .from("canvas_links")
          .insert(nextLinks.map((l) => ({ ...l, project_id: project.id })));
        if (insError) throw new Error(insError.message);
      }
      const next = [...frames, ...added];
      setFrames(next);
      setLinks(nextLinks);
      setShowFlow(true);
      fit(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't map the prototype.",
      );
    } finally {
      setMapping(null);
    }
  }

  // Arrows between frames at the same size whose screens link to each other.
  const arrows = useMemo(() => {
    if (!showFlow || links.length === 0) return [];
    const bySize = new Map<string, Map<string, Frame>>();
    for (const f of frames) {
      const key = `${f.width}x${f.height}`;
      const group = bySize.get(key) ?? new Map<string, Frame>();
      const r = normalizeRoute(f.route);
      if (!group.has(r)) group.set(r, f);
      bySize.set(key, group);
    }
    const pairs: { a: Frame; b: Frame; label: string }[] = [];
    for (const group of bySize.values())
      for (const l of links) {
        const a = group.get(normalizeRoute(l.from_route));
        const b = group.get(normalizeRoute(l.to_route));
        if (a && b && a.id !== b.id) pairs.push({ a, b, label: l.label });
      }
    // Spread arrows leaving or entering the same frame, ordered to keep them from crossing.
    const cy = (f: Frame) => f.y + f.height / 2;
    const outs = new Map<string, typeof pairs>();
    const ins = new Map<string, typeof pairs>();
    for (const p of pairs) {
      outs.set(p.a.id, [...(outs.get(p.a.id) ?? []), p]);
      ins.set(p.b.id, [...(ins.get(p.b.id) ?? []), p]);
    }
    outs.forEach((l) => l.sort((p, q) => cy(p.b) - cy(q.b)));
    ins.forEach((l) => l.sort((p, q) => cy(p.a) - cy(q.a)));
    const box = (f: Frame) => ({
      x: f.x,
      y: f.y + HEADER,
      w: f.width,
      h: f.height,
    });
    return pairs.map((p) => {
      const o = outs.get(p.a.id)!;
      const i = ins.get(p.b.id)!;
      return {
        key: `${p.a.id}-${p.b.id}`,
        label: p.label,
        ...arrowPath(
          box(p.a),
          box(p.b),
          { slot: o.indexOf(p), slots: o.length },
          { slot: i.indexOf(p), slots: i.length },
        ),
      };
    });
  }, [frames, links, showFlow]);

  async function saveEdits() {
    const out = editor.result();
    if (!out) return;
    setSaving(true);
    setError("");
    try {
      await saveVisualEdit(project.id, out.html, out.summary);
      editor.reset();
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the edit.");
    } finally {
      setSaving(false);
    }
  }

  const activeFrame = frames.find((f) => f.id === active) ?? null;
  const dragging = drag !== null;

  return (
    <div className="flex h-dvh flex-col">
      <header className="glass mx-2 mt-2 flex items-center gap-1.5 rounded-full py-1.5 pl-2 pr-1.5 lg:mx-3 lg:mt-3 lg:gap-2 lg:pl-3">
        <Link
          href="/projects"
          aria-label="All prototypes"
          className="rounded-full p-1 hover:bg-foreground/5"
        >
          <Mark size={26} />
        </Link>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="min-w-0 shrink text-sm font-semibold text-foreground"
        >
          <Link href={`/projects/${project.id}`}>
            <ArrowLeft />
            <span className="truncate">{project.name}</span>
          </Link>
        </Button>
        <Badge variant="default" className="max-md:hidden">
          Canvas{latest ? ` · v${latest.number}` : ""}
        </Badge>
        <div className="flex-1" />
        <div
          role="group"
          aria-label="Add frame"
          className="flex items-center gap-0.5 rounded-full bg-foreground/5 p-0.5"
        >
          {DEVICES.map(({ icon: Icon, ...d }) => (
            <Button
              key={d.label}
              variant="ghost"
              size="sm"
              className="h-7 hover:bg-card max-sm:px-1.5"
              disabled={!latest}
              title={`Add a ${d.label.toLowerCase()} frame`}
              onClick={() => addFrames([d], activeFrame?.route ?? "")}
            >
              <Plus className="size-3" />
              <Icon />
              <span className="hidden xl:inline">{d.label}</span>
            </Button>
          ))}
        </div>
        <div
          role="group"
          aria-label="Zoom"
          className="flex items-center gap-0.5 rounded-full bg-foreground/5 p-0.5"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 hover:bg-card max-sm:hidden"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoomAt(1 / 1.25)}
          >
            <ZoomOut />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums text-stone-700 max-sm:hidden">
            {Math.round(view.z * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 hover:bg-card max-sm:hidden"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => zoomAt(1.25)}
          >
            <ZoomIn />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 hover:bg-card"
            aria-label="Fit to screen"
            title="Fit to screen"
            onClick={() => fit()}
          >
            <Maximize />
          </Button>
        </div>
        {mapping ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => (cancelMap.current = true)}
            title="Stop mapping"
          >
            <Spinner className="size-3.5" />
            <span className="max-sm:sr-only">
              Mapping · {mapping.found} screen{mapping.found === 1 ? "" : "s"}
            </span>
            <X />
          </Button>
        ) : (
          <div
            role="group"
            aria-label="Flow"
            className="flex items-center gap-0.5 rounded-full bg-foreground/5 p-0.5"
          >
            <Popover open={mapOpen} onOpenChange={setMapOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 hover:bg-card max-sm:px-1.5"
                  disabled={!latest}
                  title="Lay out every screen with arrows between them"
                >
                  <Route />
                  <span className="max-md:sr-only">Map flow</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3">
                <p className="text-sm font-semibold">Map the flow</p>
                <p className="mt-1 text-[13px] text-stone-600">
                  Realframe opens v{latest?.number} from its first screen,
                  follows every link, and lays out a frame per screen with
                  arrows showing where each one leads.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {DEVICES.map((d) => (
                    <Button
                      key={d.label}
                      variant="outline"
                      size="sm"
                      className="h-auto flex-col gap-1 py-2"
                      onClick={() => mapFlow(d)}
                    >
                      <d.icon />
                      {d.label}
                    </Button>
                  ))}
                </div>
                {links.length > 0 && (
                  <p className="mt-2 text-[11px] text-stone-500">
                    Mapping again replaces the {links.length} saved link
                    {links.length === 1 ? "" : "s"} and keeps frames you
                    already have.
                  </p>
                )}
              </PopoverContent>
            </Popover>
            {links.length > 0 && (
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "size-7 hover:bg-card",
                  showFlow && "bg-card text-raspberry-700",
                )}
                aria-pressed={showFlow}
                aria-label={showFlow ? "Hide arrows" : "Show arrows"}
                title={showFlow ? "Hide arrows" : "Show arrows"}
                onClick={() => setShowFlow((v) => !v)}
              >
                <Spline />
              </Button>
            )}
          </div>
        )}
        <Button
          variant={editing ? "secondary" : "default"}
          disabled={!activeFrame || !latest || Boolean(latest.src)}
          aria-pressed={editing}
          title={activeFrame ? undefined : "Select a frame first"}
          onClick={() => {
            if (editing) {
              editor.reset();
              setEditing(false);
            } else setEditing(true);
          }}
        >
          {editing ? <X /> : <PencilRuler />}
          <span className="max-sm:sr-only">
            {editing ? "Exit editing" : "Edit visually"}
          </span>
        </Button>
        <div className="max-lg:hidden">{accountMenu}</div>
      </header>
      {error && (
        <p
          role="alert"
          className="mx-3 mt-2 flex items-center gap-2 rounded-full border border-red-100 bg-red-50 py-1 pl-4 pr-1 text-xs text-red-800"
        >
          <span className="flex-1">{error}</span>
          <Button
            variant="destructive"
            size="icon-sm"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => setError("")}
          >
            <X />
          </Button>
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div
          ref={board}
          className={`relative min-w-0 flex-1 touch-none overflow-hidden rounded-[1.75rem] border border-card/80 bg-card/50 ${dragging && drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(190,24,93,.22) 1.2px, transparent 1.2px)",
            backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDrag({
              kind: "pan",
              sx: e.clientX,
              sy: e.clientY,
              ox: view.x,
              oy: view.y,
            });
            if (!editing) setActive(null);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {!latest ? (
            <EmptyState
              text="Build v1 in the studio first, then lay its screens out here."
              href={`/projects/${project.id}`}
            />
          ) : frames.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex max-w-xs flex-col items-center gap-2 rounded-3xl bg-card p-6 text-center shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]">
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-2xl bg-glow-soft text-raspberry-700"
                >
                  <LayoutTemplate className="size-5" />
                </span>
                <p className="text-sm font-semibold">Start your canvas</p>
                <p className="text-[13px] text-stone-600">
                  Add v{latest.number} at desktop, tablet and phone sizes to
                  compare them side by side.
                </p>
                <Button
                  variant="default"
                  className="mt-2"
                  onClick={() => addFrames(DEVICES)}
                >
                  <Plus />
                  Add desktop, tablet and phone
                </Button>
              </div>
            </div>
          ) : null}

          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
            }}
          >
            {arrows.length > 0 && (
              <FlowArrows arrows={arrows} zoom={view.z} />
            )}
            {latest &&
              frames.map((f) => {
                const isActive = f.id === active;
                const isEditing = isActive && editing && editor.editableHtml;
                return (
                  <section
                    key={f.id}
                    aria-label={f.label}
                    className="absolute"
                    style={{ left: f.x, top: f.y, width: f.width }}
                  >
                    <div
                      className="flex cursor-move select-none items-center gap-2 px-1"
                      style={{
                        height: HEADER,
                        fontSize: Math.max(13, 13 / view.z),
                      }}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest("button,input"))
                          return;
                        (e.currentTarget as HTMLElement).setPointerCapture(
                          e.pointerId,
                        );
                        setActive(f.id);
                        setDrag({
                          kind: "move",
                          id: f.id,
                          sx: e.clientX,
                          sy: e.clientY,
                          ox: f.x,
                          oy: f.y,
                        });
                      }}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                    >
                      {renaming === f.id ? (
                        <input
                          autoFocus
                          aria-label="Frame name"
                          defaultValue={f.label}
                          maxLength={80}
                          onBlur={(e) => {
                            const label = e.target.value.trim() || f.label;
                            setRenaming(null);
                            setFrames((fs) =>
                              fs.map((x) =>
                                x.id === f.id ? { ...x, label } : x,
                              ),
                            );
                            persist(f.id, { label });
                          }}
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            (e.target as HTMLInputElement).blur()
                          }
                          className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-card px-1 outline-none focus:border-raspberry-600"
                        />
                      ) : (
                        <button
                          type="button"
                          onDoubleClick={() => setRenaming(f.id)}
                          onClick={() => setActive(f.id)}
                          title="Double-click to rename"
                          className={cn(
                            "truncate font-medium",
                            isActive ? "text-raspberry-800" : "text-stone-700",
                          )}
                        >
                          {f.label}
                        </button>
                      )}
                      <span className="shrink-0 text-stone-500">
                        {f.width}×{f.height}
                        {f.route ? ` · ${f.route}` : ""}
                      </span>
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => removeFrame(f.id)}
                        aria-label={`Remove ${f.label}`}
                        className="grid shrink-0 place-items-center rounded-full p-1 text-stone-500 transition-colors hover:bg-card hover:text-red-700"
                      >
                        <X
                          style={{ width: "1em", height: "1em" }}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    <div
                      className={`relative overflow-hidden rounded-3xl bg-card shadow-[0_18px_36px_-22px_rgba(124,58,237,.45)] ${
                        isActive
                          ? "ring-4 ring-raspberry-600"
                          : "ring-1 ring-stone-300"
                      }`}
                      style={{ height: f.height }}
                    >
                      {isEditing ? (
                        <PrototypeFrame
                          ref={editor.frame}
                          html={editor.editableHtml!}
                          title={`${f.label} (editing)`}
                          editMode
                          route={f.route}
                          onSelectElement={editor.setSelected}
                        />
                      ) : (
                        <PrototypeFrame
                          html={latest.html}
                          src={latest.src}
                          title={f.label}
                          route={f.route}
                          onRouteChange={(hash) => {
                            if (hash === f.route) return;
                            setFrames((fs) =>
                              fs.map((x) =>
                                x.id === f.id ? { ...x, route: hash } : x,
                              ),
                            );
                            persist(f.id, { route: hash.slice(0, 200) });
                          }}
                        />
                      )}
                      {/* Inactive frames, or any frame mid-drag, take clicks for selecting instead of the prototype. */}
                      {(!isActive || dragging) && (
                        <button
                          type="button"
                          aria-label={`Select ${f.label}`}
                          onClick={() => setActive(f.id)}
                          className="absolute inset-0 cursor-pointer bg-transparent"
                        />
                      )}
                    </div>
                    <div
                      role="presentation"
                      title="Drag to resize"
                      className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-card btn-glow"
                      style={{
                        transform: `scale(${Math.max(1, 1 / view.z / 2)})`,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.currentTarget as HTMLElement).setPointerCapture(
                          e.pointerId,
                        );
                        setActive(f.id);
                        setDrag({
                          kind: "resize",
                          id: f.id,
                          sx: e.clientX,
                          sy: e.clientY,
                          ow: f.width,
                          oh: f.height,
                        });
                      }}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                    />
                  </section>
                );
              })}
          </div>

          {latest && frames.length > 0 && (
            <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-card/90 px-3 py-1 text-[11px] text-stone-600 shadow-sm max-lg:hidden">
              Drag the background to pan · ⌘/Ctrl + scroll to zoom · click a
              frame to use it · navigate inside a frame to set its screen
            </p>
          )}
          {latest && frames.length > 0 && (
            <p className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-full bg-card/90 px-3 py-1 text-center text-[11px] text-stone-600 shadow-sm lg:hidden">
              Drag to pan · pinch to zoom · tap a frame to use it
            </p>
          )}
        </div>

        {mapping && latest && (
          // Off-screen frame the flow map walks through, at the size being mapped.
          <div
            aria-hidden="true"
            className="pointer-events-none fixed -left-[10000px] top-0 opacity-0"
            style={{
              width: mapping.device.width,
              height: mapping.device.height,
            }}
          >
            <PrototypeFrame
              ref={crawler}
              html={latest.html}
              src={latest.src}
              title="Mapping the flow"
            />
          </div>
        )}

        {editing && (
          <aside
            aria-label="Visual editor"
            className="glass flex shrink-0 flex-col overflow-hidden rounded-[1.75rem] max-lg:fixed max-lg:inset-x-2 max-lg:bottom-2 max-lg:z-40 max-lg:h-[45dvh] lg:w-[320px]"
          >
            <Inspector
              selected={editor.selected}
              editCount={editor.edits.length}
              onChange={editor.change}
              onSave={saveEdits}
              onDiscard={() => {
                editor.reset();
                setEditing(false);
              }}
              saving={saving}
              saveLabel={`Save as v${(latest?.number ?? 0) + 1}`}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text, href }: { text: string; href: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex max-w-xs flex-col items-center gap-3 rounded-3xl bg-card p-6 text-center shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]">
        <p className="text-[13px] text-stone-600">{text}</p>
        <Button asChild>
          <Link href={href}>
            <ArrowLeft />
            Open the studio
          </Link>
        </Button>
      </div>
    </div>
  );
}

type Arrow = {
  key: string;
  label: string;
  d: string;
  mid: { x: number; y: number };
  tip: { x: number; y: number };
  end: Side;
};

/** Arrowhead pointing into the frame along the side the arrow enters. */
function head(tip: { x: number; y: number }, end: Side, s: number) {
  const [dx, dy] =
    end === "left"
      ? [1, 0]
      : end === "right"
        ? [-1, 0]
        : end === "top"
          ? [0, 1]
          : [0, -1];
  const bx = tip.x - dx * s;
  const by = tip.y - dy * s;
  const w = s * 0.55;
  return `${tip.x},${tip.y} ${bx - dy * w},${by + dx * w} ${bx + dy * w},${by - dx * w}`;
}

function FlowArrows({ arrows, zoom }: { arrows: Arrow[]; zoom: number }) {
  // Lines and labels stay the same size on screen at any zoom.
  const k = 1 / Math.max(zoom, 0.05);
  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 overflow-visible"
        width={1}
        height={1}
      >
        {arrows.map((a) => (
          <g key={a.key} className="text-raspberry-600">
            <path
              d={a.d}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.75}
              strokeWidth={2 * k}
              strokeLinecap="round"
            />
            <polygon points={head(a.tip, a.end, 11 * k)} fill="currentColor" />
          </g>
        ))}
      </svg>
      {arrows.map((a) =>
        a.label ? (
          <span
            key={`${a.key}-label`}
            className="pointer-events-none absolute max-w-[160px] truncate whitespace-nowrap rounded-full border border-raspberry-200 bg-card px-2 py-0.5 text-[11px] font-medium text-raspberry-800 shadow-sm"
            style={{
              left: a.mid.x,
              top: a.mid.y,
              transform: `translate(-50%, -50%) scale(${k})`,
            }}
          >
            {a.label}
          </span>
        ) : null,
      )}
    </>
  );
}
