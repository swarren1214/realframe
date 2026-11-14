"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  Monitor,
  RotateCwSquare,
  Search,
  Settings2,
  Smartphone,
  Tablet,
} from "lucide-react";
import {
  canRotate,
  defaultDevice,
  devicesFor,
  effectiveOrientation,
  KIND_LABEL,
  KINDS,
  screenSize,
  type Device,
  type DeviceKind,
  type DeviceSettings,
  type Orientation,
  type ScaleMode,
} from "@/lib/devices";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export const KIND_ICON: Record<DeviceKind, typeof Monitor> = {
  desktop: Monitor,
  tablet: Tablet,
  phone: Smartphone,
};

type Stored = { device?: string; orientation?: Orientation; scale?: ScaleMode };

/**
 * The device someone is previewing on, remembered per prototype in this browser. Starts on the
 * prototype's default device and is limited to the kinds the prototype is built for.
 */
export function useDeviceView(
  key: string,
  settings: DeviceSettings,
  extra: Device[] = [],
) {
  const list = useMemo(() => devicesFor(settings, extra), [settings, extra]);
  const fallback = defaultDevice(settings, extra);
  const [stored, setStored] = useState<Stored>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`rf:device:${key}`);
      if (raw) setStored(JSON.parse(raw) as Stored);
    } catch {}
  }, [key]);

  const save = useCallback(
    (patch: Stored) =>
      setStored((s) => {
        const next = { ...s, ...patch };
        try {
          localStorage.setItem(`rf:device:${key}`, JSON.stringify(next));
        } catch {}
        return next;
      }),
    [key],
  );

  const device = list.find((d) => d.id === stored.device) ?? fallback;
  const picked: Orientation =
    stored.orientation ??
    (device.kind === "desktop" ? "landscape" : "portrait");
  const orientation = effectiveOrientation(device, settings, picked);
  const rotatable = canRotate(device, settings);
  // Desktops have no fixed size worth fitting by default; they fill the space like a browser.
  const scale: ScaleMode =
    stored.scale ?? (device.kind === "desktop" ? "dynamic" : "fit");

  const rotate = useCallback(() => {
    if (rotatable)
      save({
        orientation: orientation === "portrait" ? "landscape" : "portrait",
      });
  }, [rotatable, orientation, save]);

  // R rotates, unless someone is typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "r" && e.key !== "R") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      )
        return;
      rotate();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotate]);

  return {
    list,
    device,
    orientation,
    size: screenSize(device, orientation),
    scale,
    rotatable,
    rotate,
    // A different kind of device starts fresh: portrait, and Fit (desktops fill the space).
    setDevice: (d: Device) =>
      save(
        d.kind === device.kind
          ? { device: d.id }
          : { device: d.id, orientation: undefined, scale: undefined },
      ),
    setOrientation: (o: Orientation) => save({ orientation: o }),
    setScale: (s: ScaleMode) => save({ scale: s }),
  };
}
export type DeviceViewState = ReturnType<typeof useDeviceView>;

/**
 * Shows its child (the prototype frame) at a device's real size, scaled to fit the space
 * while keeping the device's aspect ratio. "dynamic" fills the space instead. The DOM stays
 * the same in every mode, so switching never reloads the prototype.
 */
export function DeviceStage({
  view,
  presenting = false,
  onMeasure,
  children,
}: {
  view: DeviceViewState;
  presenting?: boolean;
  onMeasure?: (m: { percent: number; width: number; height: number }) => void;
  children: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [coarse, setCoarse] = useState(false);

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setBox({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    return () => ro.disconnect();
  }, []);

  const { device, size } = view;
  // On a real phone or tablet, full screen means the prototype is the screen. Elsewhere it's
  // still the device, just as big as it fits.
  const mode: ScaleMode = presenting
    ? coarse || view.scale === "dynamic"
      ? "dynamic"
      : "fit"
    : view.scale;
  const framed =
    !presenting &&
    mode !== "dynamic" &&
    device.kind !== "desktop" &&
    device.frame !== "none";
  const bezel = framed ? (device.kind === "phone" ? 10 : 14) : 0;
  const pad = presenting ? 0 : mode === "dynamic" ? 0 : 8;

  let s = 1;
  if (mode === "fit" && box.w && box.h) {
    s = Math.min(
      (box.w - 2 * (bezel + pad)) / size.width,
      (box.h - 2 * (bezel + pad)) / size.height,
      1,
    );
    s = Math.max(s, 0.1);
  }
  const dyn = mode === "dynamic";
  const w = dyn ? box.w : size.width * s;
  const h = dyn ? box.h : size.height * s;

  useEffect(() => {
    onMeasure?.({
      percent: Math.round(s * 100),
      width: Math.round(dyn ? box.w : size.width),
      height: Math.round(dyn ? box.h : size.height),
    });
  }, [onMeasure, s, dyn, box.w, box.h, size.width, size.height]);

  const radius = dyn
    ? presenting
      ? 0
      : 24
    : Math.max(device.radius * s, device.kind === "desktop" ? 12 : 6);

  return (
    <div
      ref={outer}
      className={cn(
        "relative grid min-h-0 w-full flex-1 place-items-center",
        mode === "actual" && !presenting ? "overflow-auto" : "overflow-hidden",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 transition-[width,height,border-radius] duration-(--duration-slow) ease-(--ease-out)",
          framed &&
            "bg-[#1c1917] shadow-[0_30px_60px_-30px_rgba(28,25,23,.55)] dark:shadow-[0_30px_60px_-30px_rgba(0,0,0,.8)] dark:ring-1 dark:ring-white/10",
          !framed &&
            !presenting &&
            "border border-stone-200 bg-card shadow-[0_30px_60px_-30px_rgba(124,58,237,.35)]",
          mode === "actual" && !presenting && "m-2",
        )}
        style={{
          width: w + 2 * bezel,
          height: h + 2 * bezel,
          padding: bezel,
          borderRadius: radius + bezel,
          opacity: box.w ? 1 : 0,
        }}
      >
        <div
          className="overflow-hidden bg-white"
          style={{ width: w, height: h, borderRadius: radius }}
        >
          <div
            style={{
              width: dyn ? "100%" : size.width,
              height: dyn ? "100%" : size.height,
              transform: dyn || s === 1 ? undefined : `scale(${s})`,
              transformOrigin: "0 0",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RotateButton({ view }: { view: DeviceViewState }) {
  if (!view.rotatable) return null;
  const to = view.orientation === "portrait" ? "landscape" : "portrait";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={`Rotate to ${to}`}
          onClick={view.rotate}
        >
          <RotateCwSquare />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Rotate to {to} <Kbd>R</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** The header's device button and its menu: device list, orientation and size. */
export function DevicePicker({
  view,
  measure,
  onOpenSettings,
  compact = false,
}: {
  view: DeviceViewState;
  measure?: { width: number; height: number };
  onOpenSettings?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { device, orientation, scale } = view;
  const Icon = KIND_ICON[device.kind];
  const detail =
    scale === "dynamic" && measure
      ? `${measure.width} × ${measure.height}`
      : device.kind === "desktop"
        ? null
        : orientation === "portrait"
          ? "Portrait"
          : "Landscape";
  const found = view.list.filter((d) =>
    d.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const groups = [
    ...KINDS.map((k) => ({
      label: KIND_LABEL[k],
      items: found.filter((d) => d.kind === k && !d.team),
    })),
    { label: "Team devices", items: found.filter((d) => d.team) },
  ].filter((g) => g.items.length);

  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setQ(""))}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Preview device: ${device.name}${detail ? `, ${detail}` : ""}`}
          className="max-w-[18rem]"
        >
          <Icon />
          <span className="truncate">{device.name}</span>
          {detail && !compact && (
            <span className="hidden font-normal text-stone-500 lg:inline">
              · {detail}
            </span>
          )}
          <ChevronDown className="text-stone-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem]">
        {view.list.length > 6 && (
          <label className="mb-1 flex h-9 items-center gap-2 rounded-full bg-stone-100/80 px-3 text-sm">
            <Search className="size-3.5 text-stone-400" aria-hidden="true" />
            <span className="sr-only">Search devices</span>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search devices"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-stone-400"
            />
          </label>
        )}
        <div
          role="listbox"
          aria-label="Devices"
          className="max-h-[min(22rem,50vh)] overflow-y-auto"
        >
          {groups.map((g) => (
            <div key={g.label} role="group" aria-label={g.label}>
              <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[.08em] text-stone-500">
                {g.label}
              </p>
              {g.items.map((d) => {
                const on = d.id === device.id;
                const DIcon = KIND_ICON[d.kind];
                const sz = screenSize(
                  d,
                  d.kind === device.kind ? orientation : "portrait",
                );
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => {
                      view.setDevice(d);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[13px] transition-colors",
                      on
                        ? "bg-glow-soft font-semibold shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]"
                        : "font-medium hover:bg-stone-100",
                    )}
                  >
                    <DIcon
                      className="size-4 shrink-0 text-stone-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="font-mono text-[11px] font-normal text-stone-400">
                      {sz.width}×{sz.height}
                    </span>
                    <Check
                      className={cn(
                        "size-4 shrink-0 text-raspberry-600",
                        !on && "invisible",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          ))}
          {!groups.length && (
            <p className="px-3 py-4 text-center text-[13px] text-stone-500">
              No devices match “{q}”.
            </p>
          )}
        </div>
        <div className="mt-1.5 space-y-2 border-t border-stone-100 px-2.5 pb-1 pt-2.5">
          {device.kind !== "desktop" && (
            <div className="flex items-center gap-2">
              <span id="orient-l" className="flex-1 text-[13px] font-medium">
                Orientation
              </span>
              <ToggleGroup
                type="single"
                aria-labelledby="orient-l"
                value={orientation}
                disabled={!view.rotatable}
                onValueChange={(v) =>
                  v && view.setOrientation(v as Orientation)
                }
              >
                <ToggleGroupItem value="portrait">Portrait</ToggleGroupItem>
                <ToggleGroupItem value="landscape">Landscape</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span id="size-l" className="flex-1 text-[13px] font-medium">
              Size
            </span>
            <ToggleGroup
              type="single"
              aria-labelledby="size-l"
              value={scale}
              onValueChange={(v) => v && view.setScale(v as ScaleMode)}
            >
              <ToggleGroupItem
                value="fit"
                title="Scale the device to fit, keeping its shape"
              >
                Fit
              </ToggleGroupItem>
              <ToggleGroupItem value="actual" title="Actual size">
                100%
              </ToggleGroupItem>
              <ToggleGroupItem
                value="dynamic"
                title="Fill the space and reflow with the window"
              >
                Dynamic
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {!view.rotatable && device.kind !== "desktop" && (
            <p className="text-xs text-stone-500">
              This prototype is {orientation} only.
            </p>
          )}
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-raspberry-700"
            >
              <Settings2 className="size-3.5" aria-hidden="true" />
              Device settings
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
