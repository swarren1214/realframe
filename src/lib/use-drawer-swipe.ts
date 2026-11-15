"use client";
import { useRef } from "react";

const CLOSE_DISTANCE = 90;
const FLICK_SPEED = 0.6; // px per ms

/**
 * Phone drawers: drag the handle or title row down to close. The drawer follows
 * the finger, then either closes (far enough, or flicked) or springs back.
 * Spread `handle` on the part people grab and put `panel` on the drawer.
 */
export function useDrawerSwipe(onClose: () => void) {
  const panel = useRef<HTMLElement | null>(null);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  const last = useRef(0);

  function settle(close: boolean) {
    const el = panel.current;
    start.current = null;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    if (close) onClose();
  }

  const handle = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse") return;
      if ((e.target as HTMLElement).closest("button, a, input, textarea, [role=radio]")) return;
      start.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
      last.current = 0;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const s = start.current;
      if (!s || s.id !== e.pointerId || !panel.current) return;
      const dy = Math.max(0, e.clientY - s.y);
      last.current = dy;
      panel.current.style.transition = "none";
      panel.current.style.transform = `translateY(${dy}px)`;
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const s = start.current;
      if (!s || s.id !== e.pointerId) return;
      const speed = last.current / Math.max(1, performance.now() - s.t);
      settle(last.current > CLOSE_DISTANCE || (last.current > 24 && speed > FLICK_SPEED));
    },
    onPointerCancel() {
      settle(false);
    },
    style: { touchAction: "none" } as React.CSSProperties,
  };

  return { panel, handle };
}

/** The phone bottom bar: swipe up on it to open the drawer again. */
export function useSwipeUp(onOpen: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart(e: React.TouchEvent) {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd(e: React.TouchEvent) {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dy = s.y - t.clientY;
      if (dy > 40 && dy > Math.abs(t.clientX - s.x) * 1.5) onOpen();
    },
  };
}
