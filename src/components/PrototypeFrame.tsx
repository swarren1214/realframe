"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { withAgent } from "@/lib/agent";

export type Pin = { id: string; n: number; x: number; y: number; status: "open" | "resolved"; selected?: boolean };

export type SelectedElement = {
  rf: string | null;
  selector: string;
  tag: string;
  text: string | null;
  styles: Record<string, string>;
  rect: { w: number; h: number };
  label: string;
};

export type FrameHandle = {
  apply: (target: { rf: string | null; selector: string }, change: { styles?: Record<string, string>; text?: string }) => void;
};

type Props = {
  /** A prototype document (generated or single-file import), shown via srcdoc. */
  html?: string;
  /** An imported app served from the content domain. Takes precedence over html. */
  src?: string | null;
  title: string;
  commentMode?: boolean;
  pins?: Pin[];
  onPick?: (x: number, y: number) => void;
  onSelectPin?: (id: string) => void;
  editMode?: boolean;
  onSelectElement?: (el: SelectedElement) => void;
  route?: string;
  onRouteChange?: (hash: string) => void;
  className?: string;
  style?: React.CSSProperties;
};

// Renders a prototype in a sandboxed iframe with an opaque origin (no allow-same-origin),
// so prototype code can never read Realframe's cookies, storage or DOM.
export const PrototypeFrame = forwardRef<FrameHandle, Props>(function PrototypeFrame(
  {
    html = "",
    src,
    title,
    commentMode = false,
    pins = [],
    onPick,
    onSelectPin,
    editMode = false,
    onSelectElement,
    route,
    onRouteChange,
    className = "",
    style,
  },
  handle,
) {
  const ref = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => (src ? undefined : withAgent(html)), [html, src]);
  const latest = useRef({ commentMode, pins, onPick, onSelectPin, editMode, onSelectElement, route, onRouteChange });
  latest.current = { commentMode, pins, onPick, onSelectPin, editMode, onSelectElement, route, onRouteChange };

  function post(message: unknown) {
    ref.current?.contentWindow?.postMessage(message, "*");
  }

  function sync() {
    post({ type: "rf:mode", on: latest.current.commentMode });
    post({ type: "rf:pins", pins: latest.current.pins });
    post({ type: "rf:edit", on: latest.current.editMode });
    if (typeof latest.current.route === "string") post({ type: "rf:route", hash: latest.current.route });
  }

  useImperativeHandle(handle, () => ({
    apply: (target, change) => post({ type: "rf:apply", rf: target.rf, selector: target.selector, ...change }),
  }));

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const m = e.data as { type?: string; x?: number; y?: number; id?: string; hash?: string } & Partial<SelectedElement>;
      if (m?.type === "rf:ready") sync();
      if (m?.type === "rf:pick" && typeof m.x === "number" && typeof m.y === "number") {
        latest.current.onPick?.(Math.max(0, Math.min(1, m.x)), Math.max(0, Math.min(1, m.y)));
      }
      if (m?.type === "rf:select" && typeof m.id === "string") latest.current.onSelectPin?.(m.id);
      if (m?.type === "rf:selected" && typeof m.selector === "string") {
        latest.current.onSelectElement?.(m as SelectedElement);
      }
      if (m?.type === "rf:route-changed" && typeof m.hash === "string") latest.current.onRouteChange?.(m.hash);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    sync();
  }, [commentMode, pins, editMode, route]);

  // Generated prototypes get an opaque origin. Imported apps run on their own content-domain
  // origin (a different site from Realframe), so they may keep same-origin for storage and routing.
  return (
    <iframe
      ref={ref}
      title={title}
      {...(src ? { src } : { srcDoc })}
      sandbox={
        src
          ? "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
          : "allow-scripts allow-forms allow-popups allow-modals"
      }
      allow="fullscreen; clipboard-write"
      className={`h-full w-full border-0 bg-white ${className}`}
      style={style}
    />
  );
});
