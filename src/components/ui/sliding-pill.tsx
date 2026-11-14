"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Pill = { x: number; w: number; animate: boolean } | null;

/**
 * Tracks the selected item inside a pill track so one indicator can slide between items.
 * `selector` matches the selected item; it's re-measured when attributes change or the track resizes.
 */
export function useSlidingPill<T extends HTMLElement>(selector: string) {
  const ref = React.useRef<T>(null);
  const [pill, setPill] = React.useState<Pill>(null);

  React.useLayoutEffect(() => {
    const track = ref.current;
    if (!track) return;
    let first = true;
    const measure = () => {
      const on = track.querySelector<HTMLElement>(selector);
      if (!on) {
        setPill(null);
        first = true;
        return;
      }
      const next = { x: on.offsetLeft, w: on.offsetWidth, animate: !first };
      setPill((p) => (p && p.x === next.x && p.w === next.w ? p : next));
      first = false;
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(track, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [selector]);

  return [ref, pill] as const;
}

export function SlidingPill({ pill }: { pill: Pill }) {
  if (!pill) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-y-0.5 left-0 -z-10 rounded-full bg-card shadow-[0_1px_3px_rgba(28,25,23,.12)]",
        pill.animate &&
          "transition-[transform,width] duration-(--duration-base) ease-(--ease-out)",
      )}
      style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
    />
  );
}
