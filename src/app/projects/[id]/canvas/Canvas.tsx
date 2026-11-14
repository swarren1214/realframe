"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LayoutTemplate, Maximize, Monitor, Plus, PencilRuler, Smartphone, Tablet, X, ZoomIn, ZoomOut } from "lucide-react";
import { Mark } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PrototypeFrame } from "@/components/PrototypeFrame";
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
  | { kind: "resize"; id: string; sx: number; sy: number; ow: number; oh: number };

export function Canvas({
  project,
  frames: initialFrames,
  latest,
  accountMenu,
}: {
  accountMenu?: React.ReactNode;
  project: Project;
  frames: Frame[];
  latest: { id: string; number: number; html: string; src?: string | null } | null;
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
  const editor = useVisualEditor(editing && !latest?.src ? latest?.html : null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  // Keep local frames in sync when the server data changes (other collaborators, refreshes).
  useEffect(() => {
    if (!dragRef.current) setFrames(initialFrames);
  }, [initialFrames]);

  useEffect(() => {
    const channel = supabase
      .channel(`canvas-${project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "canvas_frames", filter: `project_id=eq.${project.id}` }, () => {
        if (!dragRef.current) router.refresh();
      })
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
      const z = Math.max(MIN_ZOOM, Math.min(1, Math.min((r.width - 120) / (maxX - minX), (r.height - 120) / (maxY - minY))));
      setView({ z, x: (r.width - (maxX - minX) * z) / 2 - minX * z, y: (r.height - (maxY - minY) * z) / 2 - minY * z });
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
      return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z };
    });
  }

  useEffect(() => {
    const el = board.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = el!.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerMove(e: React.PointerEvent) {
    const d = drag;
    if (!d) return;
    if (d.kind === "pan") setView((v) => ({ ...v, x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy }));
    if (d.kind === "move") {
      const x = d.ox + (e.clientX - d.sx) / view.z;
      const y = d.oy + (e.clientY - d.sy) / view.z;
      setFrames((fs) => fs.map((f) => (f.id === d.id ? { ...f, x: Math.round(x), y: Math.round(y) } : f)));
    }
    if (d.kind === "resize") {
      const width = Math.max(240, Math.min(3840, Math.round(d.ow + (e.clientX - d.sx) / view.z)));
      const height = Math.max(240, Math.min(4000, Math.round(d.oh + (e.clientY - d.sy) / view.z)));
      setFrames((fs) => fs.map((f) => (f.id === d.id ? { ...f, width, height } : f)));
    }
  }

  function onPointerUp() {
    const d = drag;
    setDrag(null);
    if (!d || d.kind === "pan") return;
    const f = frames.find((x) => x.id === d.id);
    if (!f) return;
    if (d.kind === "move") persist(f.id, { x: f.x, y: f.y });
    if (d.kind === "resize") persist(f.id, { width: f.width, height: f.height });
  }

  async function addFrames(devices: readonly { label: string; width: number; height: number }[], route = "") {
    const right = frames.length ? Math.max(...frames.map((f) => f.x + f.width)) + GAP : 0;
    let x = right;
    const rows = devices.map((d) => {
      const row = {
        project_id: project.id,
        label: route ? `${d.label} · ${route.replace(/^#\/?/, "") || "home"}` : d.label,
        route,
        width: d.width,
        height: d.height,
        x,
        y: 0,
      };
      x += d.width + GAP;
      return row;
    });
    const { data, error } = await supabase.from("canvas_frames").insert(rows).select("id, label, route, width, height, x, y, version_id");
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
    const { error } = await supabase.from("canvas_frames").delete().eq("id", id);
    if (error) setError(error.message);
  }

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
    <div className="flex h-screen flex-col">
      <header className="glass mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5">
        <Link href="/projects" aria-label="All prototypes" className="rounded-full p-1 hover:bg-foreground/5">
          <Mark size={26} />
        </Link>
        <Button asChild variant="ghost" size="sm" className="text-sm font-semibold text-foreground">
          <Link href={`/projects/${project.id}`}>
            <ArrowLeft />
            {project.name}
          </Link>
        </Button>
        <Badge variant="default">Canvas{latest ? ` · v${latest.number}` : ""}</Badge>
        <div className="flex-1" />
        <div role="group" aria-label="Add frame" className="flex items-center gap-0.5 rounded-full bg-foreground/5 p-0.5">
          {DEVICES.map(({ icon: Icon, ...d }) => (
            <Button
              key={d.label}
              variant="ghost"
              size="sm"
              className="h-7 hover:bg-card"
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
        <div role="group" aria-label="Zoom" className="flex items-center gap-0.5 rounded-full bg-foreground/5 p-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 hover:bg-card"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoomAt(1 / 1.25)}
          >
            <ZoomOut />
          </Button>
          <span className="w-10 text-center text-xs tabular-nums text-stone-700">{Math.round(view.z * 100)}%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 hover:bg-card"
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
          {editing ? "Exit editing" : "Edit visually"}
        </Button>
        {accountMenu}
      </header>
      {error && (
        <p
          role="alert"
          className="mx-3 mt-2 flex items-center gap-2 rounded-full border border-red-100 bg-red-50 py-1 pl-4 pr-1 text-xs text-red-800"
        >
          <span className="flex-1">{error}</span>
          <Button variant="destructive" size="icon-sm" aria-label="Dismiss" title="Dismiss" onClick={() => setError("")}>
            <X />
          </Button>
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div
          ref={board}
          className={`relative min-w-0 flex-1 overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/50 ${dragging && drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            backgroundImage: "radial-gradient(circle, rgba(190,24,93,.22) 1.2px, transparent 1.2px)",
            backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
          onPointerDown={(e) => {
            if (e.target !== e.currentTarget) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
            if (!editing) setActive(null);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {!latest ? (
            <EmptyState text="Build v1 in the studio first, then lay its screens out here." href={`/projects/${project.id}`} />
          ) : frames.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex max-w-xs flex-col items-center gap-2 rounded-3xl bg-card p-6 text-center shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]">
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-glow-soft text-raspberry-700">
                  <LayoutTemplate className="size-5" />
                </span>
                <p className="text-sm font-semibold">Start your canvas</p>
                <p className="text-[13px] text-stone-600">
                  Add v{latest.number} at desktop, tablet and phone sizes to compare them side by side.
                </p>
                <Button variant="default" className="mt-2" onClick={() => addFrames(DEVICES)}>
                  <Plus />
                  Add desktop, tablet and phone
                </Button>
              </div>
            </div>
          ) : null}

          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
          >
            {latest &&
              frames.map((f) => {
                const isActive = f.id === active;
                const isEditing = isActive && editing && editor.editableHtml;
                return (
                  <section key={f.id} aria-label={f.label} className="absolute" style={{ left: f.x, top: f.y, width: f.width }}>
                    <div
                      className="flex cursor-move select-none items-center gap-2 px-1"
                      style={{ height: HEADER, fontSize: Math.max(13, 13 / view.z) }}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest("button,input")) return;
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setActive(f.id);
                        setDrag({ kind: "move", id: f.id, sx: e.clientX, sy: e.clientY, ox: f.x, oy: f.y });
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
                            setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, label } : x)));
                            persist(f.id, { label });
                          }}
                          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                          className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-1"
                        />
                      ) : (
                        <button
                          type="button"
                          onDoubleClick={() => setRenaming(f.id)}
                          onClick={() => setActive(f.id)}
                          title="Double-click to rename"
                          className={cn("truncate font-medium", isActive ? "text-raspberry-800" : "text-stone-700")}
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
                        className="grid shrink-0 place-items-center rounded-full p-1 text-stone-500 transition-colors hover:bg-white hover:text-red-700"
                      >
                        <X style={{ width: "1em", height: "1em" }} aria-hidden="true" />
                      </button>
                    </div>
                    <div
                      className={`relative overflow-hidden rounded-3xl bg-white shadow-[0_18px_36px_-22px_rgba(124,58,237,.45)] ${
                        isActive ? "ring-4 ring-raspberry-600" : "ring-1 ring-stone-300"
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
                            setFrames((fs) => fs.map((x) => (x.id === f.id ? { ...x, route: hash } : x)));
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
                      className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white btn-glow"
                      style={{ transform: `scale(${Math.max(1, 1 / view.z / 2)})` }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                        setActive(f.id);
                        setDrag({ kind: "resize", id: f.id, sx: e.clientX, sy: e.clientY, ow: f.width, oh: f.height });
                      }}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                    />
                  </section>
                );
              })}
          </div>

          {latest && frames.length > 0 && (
            <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1 text-[11px] text-stone-600 shadow-sm">
              Drag the background to pan · ⌘/Ctrl + scroll to zoom · click a frame to use it · navigate inside a frame to set its screen
            </p>
          )}
        </div>

        {editing && (
          <aside aria-label="Visual editor" className="glass flex w-[320px] rounded-[1.75rem] shrink-0 flex-col overflow-hidden">
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
