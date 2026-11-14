"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PrototypeFrame } from "@/components/PrototypeFrame";
import { Inspector, useVisualEditor } from "@/components/Inspector";
import { createClient } from "@/lib/supabase/client";
import type { Project } from "@/lib/types";
import { saveVisualEdit } from "../../actions";

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
  { label: "Desktop", width: 1280, height: 800 },
  { label: "Tablet", width: 820, height: 1180 },
  { label: "Phone", width: 390, height: 844 },
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
}: {
  project: Project;
  frames: Frame[];
  latest: { id: string; number: number; html: string } | null;
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
  const editor = useVisualEditor(editing ? latest?.html : null);
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
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-5 py-2.5">
        <Logo href="/projects" />
        <span className="text-stone-300" aria-hidden="true">
          /
        </span>
        <a href={`/projects/${project.id}`} className="font-semibold text-stone-900 no-underline hover:underline">
          {project.name}
        </a>
        <span className="rounded-md bg-ember-50 px-2 py-1 text-xs font-semibold text-ember-800">
          Canvas{latest ? ` · v${latest.number}` : ""}
        </span>
        <div className="flex-1" />
        <div role="group" aria-label="Add frame" className="flex gap-1">
          {DEVICES.map((d) => (
            <button
              key={d.label}
              type="button"
              disabled={!latest}
              onClick={() => addFrames([d], activeFrame?.route ?? "")}
              className="min-h-9 rounded-lg border border-stone-200 px-3 text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              + {d.label}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Zoom" className="flex items-center gap-1 rounded-lg bg-stone-100 p-0.5">
          <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.25)} className="h-8 w-8 rounded-md text-lg hover:bg-white">
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-stone-700">{Math.round(view.z * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.25)} className="h-8 w-8 rounded-md text-lg hover:bg-white">
            +
          </button>
          <button type="button" onClick={() => fit()} className="h-8 rounded-md px-2 text-xs font-medium hover:bg-white">
            Fit
          </button>
        </div>
        <button
          type="button"
          disabled={!activeFrame || !latest}
          aria-pressed={editing}
          onClick={() => {
            if (editing) {
              editor.reset();
              setEditing(false);
            } else setEditing(true);
          }}
          title={activeFrame ? undefined : "Select a frame first"}
          className={`min-h-9 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${
            editing ? "bg-stone-900 text-white" : "bg-ember-700 text-white hover:bg-ember-800"
          }`}
        >
          {editing ? "Exit editing" : "Edit visually"}
        </button>
      </header>
      {error && (
        <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-800">
          {error}{" "}
          <button type="button" onClick={() => setError("")} className="underline">
            Dismiss
          </button>
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <div
          ref={board}
          className={`relative min-w-0 flex-1 overflow-hidden bg-stone-200 ${dragging && drag?.kind === "pan" ? "cursor-grabbing" : "cursor-grab"}`}
          style={{
            backgroundImage: "radial-gradient(circle, rgba(68,64,60,.18) 1px, transparent 1px)",
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
              <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
                <p className="font-semibold">Start your canvas</p>
                <p className="mt-1 text-sm text-stone-600">Add v{latest.number} at desktop, tablet and phone sizes to compare them side by side.</p>
                <button
                  type="button"
                  onClick={() => addFrames(DEVICES)}
                  className="mt-4 min-h-10 rounded-lg bg-ember-700 px-4 text-sm font-semibold text-white hover:bg-ember-800"
                >
                  Add desktop, tablet and phone
                </button>
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
                  <section
                    key={f.id}
                    aria-label={f.label}
                    className="absolute"
                    style={{ left: f.x, top: f.y, width: f.width }}
                  >
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
                          className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-1"
                        />
                      ) : (
                        <button
                          type="button"
                          onDoubleClick={() => setRenaming(f.id)}
                          onClick={() => setActive(f.id)}
                          title="Double-click to rename"
                          className={`truncate font-medium ${isActive ? "text-ember-800" : "text-stone-700"}`}
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
                        className="shrink-0 rounded px-1 text-stone-500 hover:bg-white hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                    <div
                      className={`relative overflow-hidden rounded-lg bg-white shadow-md ${
                        isActive ? "ring-4 ring-ember-700" : "ring-1 ring-stone-300"
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
                      className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-ember-700"
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
            <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-xs text-stone-600 shadow-sm">
              Drag the background to pan · ⌘/Ctrl + scroll to zoom · click a frame to use it · navigate inside a frame to set its screen
            </p>
          )}
        </div>

        {editing && (
          <aside aria-label="Visual editor" className="flex w-[320px] shrink-0 flex-col border-l border-stone-200 bg-white">
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
      <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-stone-600">{text}</p>
        <a href={href} className="mt-3 inline-block text-sm font-semibold">
          Open the studio
        </a>
      </div>
    </div>
  );
}
