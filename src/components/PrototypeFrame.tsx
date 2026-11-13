"use client";
import { useEffect, useMemo, useRef } from "react";
import { withAgent } from "@/lib/agent";

export type Pin = { id: string; n: number; x: number; y: number; status: "open" | "resolved"; selected?: boolean };

// Renders a prototype in a sandboxed iframe with an opaque origin (no allow-same-origin),
// so prototype code can never read Realframe's cookies, storage or DOM.
export function PrototypeFrame({
  html,
  title,
  commentMode = false,
  pins = [],
  onPick,
  onSelectPin,
  className = "",
}: {
  html: string;
  title: string;
  commentMode?: boolean;
  pins?: Pin[];
  onPick?: (x: number, y: number) => void;
  onSelectPin?: (id: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => withAgent(html), [html]);
  const latest = useRef({ commentMode, pins, onPick, onSelectPin });
  latest.current = { commentMode, pins, onPick, onSelectPin };

  function sync() {
    const win = ref.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "rf:mode", on: latest.current.commentMode }, "*");
    win.postMessage({ type: "rf:pins", pins: latest.current.pins }, "*");
  }

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const m = e.data as { type?: string; x?: number; y?: number; id?: string };
      if (m?.type === "rf:ready") sync();
      if (m?.type === "rf:pick" && typeof m.x === "number" && typeof m.y === "number") {
        latest.current.onPick?.(Math.max(0, Math.min(1, m.x)), Math.max(0, Math.min(1, m.y)));
      }
      if (m?.type === "rf:select" && typeof m.id === "string") latest.current.onSelectPin?.(m.id);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    sync();
  }, [commentMode, pins]);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-popups allow-modals"
      className={`h-full w-full border-0 bg-white ${className}`}
    />
  );
}
