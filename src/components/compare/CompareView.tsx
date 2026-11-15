"use client";
import { useEffect, useRef, useState } from "react";
import { Columns2, Layers, SplitSquareHorizontal, X } from "lucide-react";
import { PrototypeFrame, type FrameHandle } from "@/components/PrototypeFrame";
import { DeviceStage, type DeviceViewState } from "@/components/devices/DeviceView";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useIsLarge } from "@/lib/use-media";
import { cn } from "@/lib/utils";

export type CompareVersion = { id: string; number: number; summary: string | null };
export type CompareContent = { html?: string | null; src?: string | null };
type Mode = "side" | "slider" | "overlay";

const MODES: { id: Mode; label: string; icon: typeof Columns2 }[] = [
  { id: "side", label: "Side by side", icon: Columns2 },
  { id: "slider", label: "Slider", icon: SplitSquareHorizontal },
  { id: "overlay", label: "Overlay", icon: Layers },
];

/**
 * Two versions of a prototype against each other. Side by side keeps scrolling
 * and navigation in step; Slider wipes the newer over the older; Overlay fades.
 */
export function CompareView({
  versions,
  initial,
  load,
  view,
  onClose,
  className,
}: {
  /** Newest first. */
  versions: CompareVersion[];
  initial: { before: string; after: string };
  load: (id: string) => Promise<CompareContent>;
  view: DeviceViewState;
  onClose: () => void;
  className?: string;
}) {
  const large = useIsLarge();
  const [mode, setMode] = useState<Mode>(large ? "side" : "slider");
  const [before, setBefore] = useState(initial.before);
  const [after, setAfter] = useState(initial.after);
  const [content, setContent] = useState<Record<string, CompareContent>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [route, setRoute] = useState<string | undefined>(undefined);
  const [split, setSplit] = useState(50);
  const [fade, setFade] = useState(50);
  // Phones open on Slider: two phones side by side are too small to read.
  useEffect(() => {
    if (!large) setMode((m) => (m === "side" ? "slider" : m));
  }, [large]);
  const frames = { before: useRef<FrameHandle>(null), after: useRef<FrameHandle>(null) };

  useEffect(() => {
    setBefore(initial.before);
    setAfter(initial.after);
  }, [initial.before, initial.after]);

  useEffect(() => {
    for (const id of [before, after]) {
      if (content[id] || failed[id]) continue;
      load(id)
        .then((c) => setContent((cur) => ({ ...cur, [id]: c })))
        .catch(() => setFailed((cur) => ({ ...cur, [id]: true })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const info = (id: string) => versions.find((v) => v.id === id);
  const label = (id: string) => {
    const v = info(id);
    return v ? `v${v.number}` : "";
  };

  function frame(side: "before" | "after", extra?: string, style?: React.CSSProperties) {
    const id = side === "before" ? before : after;
    const c = content[id];
    const other = side === "before" ? frames.after : frames.before;
    if (failed[id])
      return (
        <div className="grid h-full place-items-center bg-card p-6 text-center text-[13px] text-stone-500">
          Couldn&apos;t load {label(id)}.
        </div>
      );
    if (!c)
      return (
        <div className="grid h-full place-items-center bg-card">
          <Spinner />
        </div>
      );
    return (
      <PrototypeFrame
        key={id}
        ref={frames[side]}
        html={c.html ?? ""}
        src={c.src ?? undefined}
        title={`${label(id)} (${side})`}
        route={route}
        onRouteChange={setRoute}
        onScroll={(path, y) => other.current?.scrollTo(path, y)}
        className={extra}
        style={style}
      />
    );
  }

  function Caption({ id, tone }: { id: string; tone: "before" | "after" }) {
    const v = info(id);
    return (
      <div className="min-w-0 text-center">
        <span
          className={cn(
            "mr-1.5 inline-block rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide",
            tone === "after" ? "bg-raspberry-100 text-raspberry-800" : "bg-stone-200 text-stone-700",
          )}
        >
          {tone === "after" ? "After" : "Before"}
        </span>
        <b className="text-[13px]">v{v?.number}</b>
        {v?.summary && (
          <span className="block truncate text-[11px] text-stone-500">{v.summary}</span>
        )}
      </div>
    );
  }

  const picker = (value: string, onChange: (id: string) => void, exclude: string, aria: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={aria}
        className="h-8 min-w-0 border-transparent bg-secondary font-semibold shadow-none hover:border-transparent max-sm:[&_[data-summary]]:hidden"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {versions.map((v) => (
          <SelectItem key={v.id} value={v.id} disabled={v.id === exclude}>
            <span className="font-semibold">v{v.number}</span>
            {v.summary && (
              <span data-summary className="max-w-52 truncate text-muted-foreground">
                {v.summary}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          {picker(before, setBefore, after, "Before version")}
          <span className="text-xs text-stone-400">vs</span>
          {picker(after, setAfter, before, "After version")}
        </div>
        <div className="flex-1" />
        <div role="radiogroup" aria-label="Compare mode" className="flex rounded-full bg-secondary p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors",
                mode === m.id ? "bg-card text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900",
              )}
            >
              <m.icon className="size-3.5" aria-hidden="true" />
              <span className="max-sm:sr-only">{m.label}</span>
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={onClose} aria-label="Done comparing">
          <X />
          <span className="max-sm:hidden">Done</span>
        </Button>
      </div>

      {mode === "side" ? (
        <div className="flex min-h-0 flex-1 gap-4 max-sm:gap-2">
          {(["before", "after"] as const).map((side) => (
            <div key={side} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <Caption id={side === "before" ? before : after} tone={side} />
              <div className="flex min-h-0 flex-1 flex-col">
                <DeviceStage view={view}>{frame(side)}</DeviceStage>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex justify-center gap-6 sm:gap-10">
            <Caption id={before} tone="before" />
            <Caption id={after} tone="after" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <DeviceStage view={view}>
              <div className="relative h-full w-full">
                <div className="absolute inset-0">{frame("before")}</div>
                <div
                  className="absolute inset-0"
                  style={
                    mode === "slider"
                      ? { clipPath: `inset(0 0 0 ${split}%)` }
                      : { opacity: fade / 100 }
                  }
                >
                  {frame("after")}
                </div>
                {mode === "slider" && <Wipe value={split} onChange={setSplit} />}
              </div>
            </DeviceStage>
          </div>
          {mode === "overlay" && (
            <label className="mx-auto flex w-full max-w-xs items-center gap-3 text-xs text-stone-600">
              {label(before)}
              <input
                type="range"
                min={0}
                max={100}
                value={fade}
                onChange={(e) => setFade(Number(e.target.value))}
                aria-label="Fade between versions"
                className="flex-1 accent-raspberry-700"
              />
              {label(after)}
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** The draggable divider of the slider mode. Keyboard: arrow keys. */
function Wipe({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  function move(clientX: number) {
    const r = box.current?.parentElement?.getBoundingClientRect();
    if (!r) return;
    onChange(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }
  return (
    <>
      {/* While dragging, a shield keeps the frames from swallowing pointer moves. */}
      {dragging && (
        <div
          className="absolute inset-0 z-10 cursor-ew-resize"
          onPointerMove={(e) => move(e.clientX)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        />
      )}
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label="Divider between versions"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true);
        }}
        onPointerMove={(e) => dragging && move(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onChange(Math.max(0, value - 5));
          if (e.key === "ArrowRight") onChange(Math.min(100, value + 5));
        }}
        style={{ left: `${value}%` }}
        className="absolute inset-y-0 z-20 -ml-5 flex w-10 cursor-ew-resize touch-none justify-center outline-none focus-visible:[&>span:last-child]:ring-4 focus-visible:[&>span:last-child]:ring-raspberry-200"
      >
        <span className="h-full w-0.5 bg-raspberry-700 shadow-[0_0_0_1px_rgba(255,255,255,.8)]" />
        <span className="absolute top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-raspberry-700 text-white shadow-lg">
          <SplitSquareHorizontal className="size-4" aria-hidden="true" />
        </span>
      </div>
    </>
  );
}
