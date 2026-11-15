"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { withAgent } from "@/lib/agent";
import type { Inspected, Tokens, TreeNode } from "@/lib/inspect";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type Pin = {
  id: string;
  n: number;
  x: number;
  y: number;
  status: "open" | "resolved";
  selected?: boolean;
};

export type SelectedElement = {
  rf: string | null;
  selector: string;
  tag: string;
  text: string | null;
  styles: Record<string, string>;
  rect: { w: number; h: number };
  label: string;
  /** The element's markup, trimmed to 2,000 characters. */
  html?: string;
  /** Whether Shift was held: add to the selection instead of replacing it. */
  shift?: boolean;
};

export type FrameHandle = {
  /** Reload the prototype from its starting state: first screen, no saved data. */
  restart: () => void;
  apply: (
    target: { rf: string | null; selector: string },
    change: { styles?: Record<string, string>; text?: string },
  ) => void;
  /** Scrolls the same element (by path) to a fraction of its scrollable height. */
  scrollTo: (path: string, y: number) => void;
  /** An element's full markup and the CSS that styles it, for export. */
  extract: (target: {
    rf?: string | null;
    selector: string;
  }) => Promise<Extracted>;
  /** Dev mode: select or hover an element by its path, hold Alt, highlight a token's uses. */
  inspectSelect: (path: string) => void;
  inspectHover: (path: string | null) => void;
  inspectAlt: (on: boolean) => void;
  highlight: (kind: keyof Tokens | null, value?: string) => void;
  /** Dev mode: the rendered element tree, and the design values in use. */
  tree: () => Promise<TreeNode[]>;
  tokens: () => Promise<Tokens>;
};

export type Extracted = {
  html: string;
  css: string;
  fonts: string[];
  label: string;
  tag: string;
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
  /** Dev mode: measure and select elements instead of using the prototype. */
  inspect?: boolean;
  onInspect?: (el: Inspected) => void;
  route?: string;
  onRouteChange?: (hash: string) => void;
  /** Fires as the prototype scrolls; used to keep two versions in step. */
  onScroll?: (path: string, y: number) => void;
  className?: string;
  style?: React.CSSProperties;
};

// Renders a prototype in a sandboxed iframe with an opaque origin (no allow-same-origin),
// so prototype code can never read Realframe's cookies, storage or DOM.
export const PrototypeFrame = forwardRef<FrameHandle, Props>(
  function PrototypeFrame(
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
      onScroll,
      inspect = false,
      onInspect,
      className = "",
      style,
    },
    handle,
  ) {
    const ref = useRef<HTMLIFrameElement>(null);
    // Pending export requests to the frame, by id.
    const extracting = useRef(
      new Map<string, (m: Record<string, unknown>) => void>(),
    );
    const extractSeq = useRef(0);
    const srcDoc = useMemo(
      () => (src ? undefined : withAgent(html, { srcdoc: true })),
      [html, src],
    );
    // "loading" until the agent inside says it's ready; "failed" if the page loads without it
    // (an error page) or never loads at all.
    const [state, setState] = useState<"loading" | "ready" | "failed">(
      "loading",
    );
    const [attempt, setAttempt] = useState(0);
    const content = src ?? srcDoc;
    const [shown, setShown] = useState(content);
    if (shown !== content) {
      setShown(content);
      setState("loading");
    }
    const timers = useRef<number[]>([]);
    function clearTimers() {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    }
    useEffect(() => {
      clearTimers();
      // A page that never finishes loading.
      timers.current.push(
        window.setTimeout(
          () => setState((s) => (s === "loading" ? "failed" : s)),
          25_000,
        ),
      );
      // The page can finish loading before React hydrates, so its ready message goes unheard.
      // Ask again; the agent answers once the page has loaded.
      post({ type: "rf:ping" });
      return clearTimers;
    }, [content, attempt]);

    function onLoad() {
      post({ type: "rf:ping" });
      // The agent posts ready on the page's load event, just before this fires. Give it a beat.
      timers.current.push(
        window.setTimeout(
          () =>
            setState((s) => (s === "loading" ? (src ? "failed" : "ready") : s)),
          src ? 2500 : 600,
        ),
      );
    }
    const latest = useRef({
      commentMode,
      pins,
      onPick,
      onSelectPin,
      editMode,
      onSelectElement,
      route,
      onRouteChange,
      onScroll,
      inspect,
      onInspect,
    });
    latest.current = {
      commentMode,
      pins,
      onPick,
      onSelectPin,
      editMode,
      onSelectElement,
      route,
      onRouteChange,
      onScroll,
      inspect,
      onInspect,
    };

    function post(message: unknown) {
      ref.current?.contentWindow?.postMessage(message, "*");
    }

    function sync() {
      post({ type: "rf:mode", on: latest.current.commentMode });
      post({ type: "rf:pins", pins: latest.current.pins });
      post({ type: "rf:edit", on: latest.current.editMode });
      post({ type: "rf:inspect", on: Boolean(latest.current.inspect) });
      if (typeof latest.current.route === "string")
        post({ type: "rf:route", hash: latest.current.route });
    }

    /** A request the preview answers by id. */
    function ask(type: string) {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const id = `q${++extractSeq.current}`;
        const timer = setTimeout(() => {
          extracting.current.delete(id);
          reject(new Error("The preview didn't answer."));
        }, 8000);
        extracting.current.set(id, (m) => {
          clearTimeout(timer);
          resolve(m);
        });
        post({ type, id });
      });
    }

    useImperativeHandle(handle, () => ({
      restart: () => {
        // Imported apps keep real storage on their own domain: clear it before reloading.
        // Generated prototypes keep theirs in memory, which the reload drops.
        if (src) post({ type: "rf:reset" });
        clearTimers();
        setState("loading");
        window.setTimeout(() => setAttempt((a) => a + 1), src ? 120 : 0);
      },
      apply: (target, change) =>
        post({
          type: "rf:apply",
          rf: target.rf,
          selector: target.selector,
          ...change,
        }),
      scrollTo: (path, y) => post({ type: "rf:scroll-to", path, y }),
      inspectSelect: (path) => post({ type: "rf:inspect-select", path }),
      inspectHover: (path) => post({ type: "rf:inspect-hover", path }),
      inspectAlt: (on) => post({ type: "rf:inspect-alt", on }),
      highlight: (kind, value) =>
        post({ type: "rf:inspect-highlight", kind, value }),
      tree: () =>
        ask("rf:tree").then((m) => (Array.isArray(m.nodes) ? m.nodes : [])),
      tokens: () => ask("rf:tokens").then((m) => m.tokens as Tokens),
      extract: (target) =>
        new Promise<Extracted>((resolve, reject) => {
          const id = `x${++extractSeq.current}`;
          const timer = setTimeout(() => {
            extracting.current.delete(id);
            reject(
              new Error("The preview didn't answer. Reload it and try again."),
            );
          }, 5000);
          extracting.current.set(id, (m) => {
            clearTimeout(timer);
            if (m.error) reject(new Error(String(m.error)));
            else
              resolve({
                html: String(m.html ?? ""),
                css: String(m.css ?? ""),
                fonts: Array.isArray(m.fonts) ? m.fonts.map(String) : [],
                label: String(m.label ?? ""),
                tag: String(m.tag ?? ""),
              });
          });
          post({
            type: "rf:extract",
            id,
            rf: target.rf ?? null,
            selector: target.selector,
          });
        }),
    }));

    useEffect(() => {
      function onMessage(e: MessageEvent) {
        if (!ref.current || e.source !== ref.current.contentWindow) return;
        const m = e.data as {
          type?: string;
          x?: number;
          y?: number;
          id?: string;
          hash?: string;
          path?: string;
        } & Partial<SelectedElement>;
        if (m?.type === "rf:ready") {
          sync();
          setState("ready");
        }
        if (
          m?.type === "rf:pick" &&
          typeof m.x === "number" &&
          typeof m.y === "number"
        ) {
          latest.current.onPick?.(
            Math.max(0, Math.min(1, m.x)),
            Math.max(0, Math.min(1, m.y)),
          );
        }
        if (m?.type === "rf:select" && typeof m.id === "string")
          latest.current.onSelectPin?.(m.id);
        if (m?.type === "rf:selected" && typeof m.selector === "string") {
          latest.current.onSelectElement?.(m as SelectedElement);
        }
        if (m?.type === "rf:route-changed" && typeof m.hash === "string")
          latest.current.onRouteChange?.(m.hash);
        if (m?.type === "rf:inspected" && typeof m.path === "string")
          latest.current.onInspect?.(m as unknown as Inspected);
        if (
          (m?.type === "rf:extracted" ||
            m?.type === "rf:tree" ||
            m?.type === "rf:tokens") &&
          typeof m.id === "string"
        ) {
          const done = extracting.current.get(m.id);
          extracting.current.delete(m.id);
          done?.(m as unknown as Record<string, unknown>);
        }
        if (m?.type === "rf:scroll" && typeof m.y === "number")
          latest.current.onScroll?.(String(m.path ?? ""), m.y);
      }
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    }, []);

    useEffect(() => {
      sync();
    }, [commentMode, pins, editMode, route, inspect]);

    // Every prototype runs with an opaque origin (no allow-same-origin), so its code can't reach
    // Realframe's cookies or storage. Imported apps load by URL from their own subdomain.
    return (
      <div className={cn("relative h-full w-full", className)} style={style}>
        <iframe
          key={attempt}
          ref={ref}
          title={title}
          {...(src ? { src } : { srcDoc })}
          onLoad={onLoad}
          sandbox={
            src
              ? "allow-scripts allow-forms allow-popups allow-modals allow-downloads"
              : "allow-scripts allow-forms allow-popups allow-modals"
          }
          allow="fullscreen; clipboard-write"
          className={cn(
            "h-full w-full border-0 bg-white transition-opacity duration-(--duration-slow) ease-(--ease-out)",
            state === "ready" ? "opacity-100" : "opacity-0",
          )}
        />
        {state === "loading" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-card">
            <Spinner className="size-5 text-stone-400 [animation-delay:200ms]" />
          </div>
        )}
        {state === "failed" && (
          <div
            role="alert"
            className="absolute inset-0 grid place-items-center bg-card p-6 text-center"
          >
            <div className="flex max-w-xs flex-col items-center gap-2">
              <span className="grid size-10 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                <TriangleAlert className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-stone-900">
                This version didn&apos;t load
              </p>
              <p className="text-[13px] text-stone-500">
                It may still be starting up, or the page hit an error.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => {
                  setState("loading");
                  setAttempt((a) => a + 1);
                }}
              >
                <RotateCw />
                Try again
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  },
);
