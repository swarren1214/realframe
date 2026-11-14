"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize, Minimize2, Share, X } from "lucide-react";
import { PrototypeFrame } from "@/components/PrototypeFrame";
import { Button } from "@/components/ui/button";

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

/** True when the browser can put the page into real full screen (desktop, Android, iPad). iPhone can't. */
export function canFullscreen() {
  if (typeof document === "undefined") return false;
  const el = document.documentElement as FsEl;
  return Boolean(document.fullscreenEnabled && (el.requestFullscreen || el.webkitRequestFullscreen));
}

function isFullscreen() {
  const d = document as FsDoc;
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Launched from the home screen, where the page already owns the whole display. */
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Call from a click handler: browsers only allow full screen in response to a user gesture. */
export function enterFullscreen() {
  if (!canFullscreen() || isFullscreen()) return;
  const el = document.documentElement as FsEl;
  (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.())?.catch(() => {});
}

function exitFullscreen() {
  const d = document as FsDoc;
  if (!isFullscreen()) return;
  (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.())?.catch(() => {});
}

/**
 * The prototype edge to edge with no Realframe chrome, inside the device's safe areas.
 * The page itself goes full screen where the browser allows it; on iPhone, where it doesn't,
 * we point people to Add to Home Screen, which opens the review link as a full-screen web app.
 */
export function PresentMode({ html, src, title, onExit }: { html?: string; src?: string | null; title: string; onExit: () => void }) {
  const [hint, setHint] = useState<"none" | "tap" | "homescreen">("none");
  const [full, setFull] = useState(false);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    const sync = () => setFull(isFullscreen());
    sync();
    if (!isFullscreen() && !isStandalone()) {
      if (canFullscreen()) setHint("tap");
      else if (/iPhone|iPod/.test(navigator.userAgent)) setHint("homescreen");
    }
    let wasFull = isFullscreen();
    const onChange = () => {
      sync();
      // Leaving full screen with Esc or the system gesture also leaves present mode.
      if (wasFull && !isFullscreen()) exitRef.current();
      wasFull = isFullscreen();
      if (wasFull) setHint("none");
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !isFullscreen() && exitRef.current();
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (hint === "none") return;
    const t = setTimeout(() => setHint("none"), 8000);
    return () => clearTimeout(t);
  }, [hint]);

  function exit() {
    exitFullscreen();
    onExit();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title}, full screen`}
      className="fixed inset-0 z-50 bg-black pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]"
    >
      <PrototypeFrame html={html} src={src} title={title} />

      <div className="group absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] flex gap-1 opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100">
        {!full && canFullscreen() && (
          <Button
            variant="secondary"
            size="icon-sm"
            className="bg-stone-900/80 backdrop-blur"
            aria-label="Go full screen"
            title="Go full screen"
            onClick={enterFullscreen}
          >
            <Maximize />
          </Button>
        )}
        <Button
          variant="secondary"
          size="icon-sm"
          className="bg-stone-900/80 backdrop-blur"
          aria-label="Exit full screen"
          title="Exit full screen (Esc)"
          onClick={exit}
        >
          {full ? <Minimize2 /> : <X />}
        </Button>
      </div>

      {hint !== "none" && (
        <div
          role="status"
          className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-stone-900/90 py-1.5 pl-4 pr-1.5 text-xs text-white shadow-lg backdrop-blur"
        >
          {hint === "tap" ? (
            <>
              <span>Hide the browser bars too</span>
              <Button variant="default" size="sm" className="h-7" onClick={enterFullscreen}>
                <Maximize />
                Full screen
              </Button>
            </>
          ) : (
            <span className="flex items-center gap-1.5 py-1 pr-2">
              For true full screen, tap <Share className="size-3.5" aria-label="Share" /> then “Add to Home Screen”.
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
            onClick={() => setHint("none")}
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
