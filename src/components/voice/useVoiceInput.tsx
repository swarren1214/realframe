"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  MODE_NOTE,
  appendTranscript,
  clock,
  voiceCommand,
  type VoiceCommand,
} from "@/lib/voice";
import { dictationSupported, useDictation } from "./useDictation";

const INTRO_KEY = "rf-voice-intro";
const AUTOSEND_KEY = "rf-voice-autosend";
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: remember for this visit only */
  }
};

/**
 * Talk instead of type. Returns the mic button and the listening bar for the parent to place.
 * Dictated words land in the box (`value`/`onChange`) and nothing runs until Send, unless the
 * person turned on Auto-send. "Send", "cancel" and a few other whole phrases act directly.
 * Hold ⌥ Space to talk while `hotkey` is on.
 */
export function useVoiceInput(opts: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (text: string) => void;
  onCommand?: (cmd: VoiceCommand) => void;
  disabled?: boolean;
  hotkey?: boolean;
  /** Names the target for "this", shown while listening. */
  context?: string | null;
}) {
  const [supported, setSupported] = useState(false);
  useEffect(() => setSupported(dictationSupported()), []);
  const [intro, setIntro] = useState(false);
  const [autoSend, setAutoSend] = useState(false);
  useEffect(() => setAutoSend(read(AUTOSEND_KEY) === "1"), []);
  const draft = useRef(opts.value);
  const before = useRef(opts.value);
  const sendNow = useRef(false);
  const latest = useRef(opts);
  latest.current = opts;

  const d = useDictation({
    onFinal: (text) => {
      const cmd = voiceCommand(text);
      if (cmd?.kind === "send") {
        sendNow.current = true;
        d.stop();
        return;
      }
      if (cmd?.kind === "cancel") {
        draft.current = before.current;
        latest.current.onChange(before.current);
        d.cancel();
        return;
      }
      if (cmd) {
        latest.current.onCommand?.(cmd);
        return;
      }
      draft.current = appendTranscript(draft.current, text);
      latest.current.onChange(draft.current);
    },
    onStop: () => {
      const text = draft.current.trim();
      if (text && (sendNow.current || autoSendRef.current))
        latest.current.onSubmit(text);
      sendNow.current = false;
    },
  });
  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;
  const active =
    d.state.status === "listening" || d.state.status === "preparing";
  if (!active) draft.current = opts.value;

  function begin() {
    if (opts.disabled) return;
    if (!read(INTRO_KEY)) {
      setIntro(true);
      return;
    }
    before.current = opts.value;
    draft.current = opts.value;
    sendNow.current = false;
    void d.start();
  }
  function toggle() {
    if (active) d.stop();
    else begin();
  }

  // Hold ⌥ Space to talk; Esc cancels.
  const held = useRef(false);
  useEffect(() => {
    if (!opts.hotkey || !supported) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!e.repeat && !held.current && !latest.current.disabled) {
          held.current = true;
          if (read(INTRO_KEY)) begin();
          else setIntro(true);
        }
      } else if (e.key === "Escape" && activeRef.current) {
        e.preventDefault();
        draft.current = before.current;
        latest.current.onChange(before.current);
        d.cancel();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (held.current && (e.code === "Space" || e.key === "Alt")) {
        held.current = false;
        d.stop();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.hotkey, supported]);
  const activeRef = useRef(active);
  activeRef.current = active;

  const button = supported ? (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="icon"
      className="size-8 shrink-0"
      aria-label={active ? "Stop listening" : "Talk instead of typing"}
      aria-pressed={active}
      aria-keyshortcuts={opts.hotkey ? "Alt+Space" : undefined}
      title={
        active
          ? "Stop listening"
          : `Talk${opts.hotkey ? " (hold ⌥ Space)" : ""}`
      }
      disabled={opts.disabled && !active}
      onClick={toggle}
    >
      {active ? <Square className="size-3 fill-current" /> : <Mic />}
    </Button>
  ) : null;

  let bar: React.ReactNode = null;
  if (intro)
    bar = (
      <div className="mb-2 space-y-2 rounded-2xl border border-raspberry-200 bg-raspberry-50/60 p-3 text-[13px]">
        <p className="font-semibold">Talk to build</p>
        <p className="text-stone-700">
          Voice uses your browser&apos;s own speech recognition. Chrome, Edge
          and Firefox turn speech into text on your device when they can;
          otherwise your browser&apos;s speech service does. Realframe never
          receives the audio, only the words, and nothing runs until you send.
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => {
              write(INTRO_KEY, "1");
              setIntro(false);
              begin();
            }}
          >
            <Mic />
            Start talking
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setIntro(false)}
          >
            Not now
          </Button>
        </div>
      </div>
    );
  else if (d.state.status === "preparing")
    bar = (
      <div
        role="status"
        className="mb-2 flex items-center gap-2 rounded-2xl bg-secondary p-3 text-[13px] text-stone-700"
      >
        <Spinner />
        {d.state.note}
      </div>
    );
  else if (d.state.status === "error")
    bar = (
      <div
        role="alert"
        className="mb-2 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-[13px] text-red-900"
      >
        <span className="flex-1">{d.state.message}</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={d.dismiss}
          className="grid size-5 place-items-center rounded-full hover:bg-red-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  else if (d.state.status === "listening") {
    const s = d.state;
    bar = (
      <div className="mb-2 space-y-2 rounded-2xl border-2 border-raspberry-600 bg-card p-3 shadow-[0_0_0_4px_var(--color-raspberry-50)]">
        <div className="flex items-center gap-2 text-[13px]">
          <span
            className="size-2 animate-pulse rounded-full bg-raspberry-600"
            aria-hidden="true"
          />
          <span className="font-semibold text-raspberry-800">Listening</span>
          <Clock since={s.startedAt} />
          <Meter level={d.level} />
        </div>
        <p aria-live="polite" className="min-h-5 text-sm leading-relaxed">
          {s.interim ? (
            <span className="text-stone-500">{s.interim}</span>
          ) : (
            <span className="text-stone-400">
              {opts.context
                ? `Say what to change about ${opts.context}…`
                : "Say what you want…"}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-2 text-xs text-stone-600">
          <span>{MODE_NOTE[s.mode]}</span>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={autoSend}
              onChange={(e) => {
                setAutoSend(e.target.checked);
                write(AUTOSEND_KEY, e.target.checked ? "1" : "0");
              }}
              className="size-3.5 accent-raspberry-700"
            />
            Auto-send when I stop
          </label>
          <span className="ml-auto">
            Say &ldquo;send&rdquo; to build · Esc to cancel
          </span>
        </div>
      </div>
    );
  }
  return { button, bar, listening: active };
}

function Clock({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tabular-nums text-xs text-stone-600">
      {clock(now - since)}
    </span>
  );
}

/** A small scrolling level meter: the last 20 readings. */
function Meter({ level }: { level: number }) {
  const [hist, setHist] = useState<number[]>(() => Array(20).fill(0));
  useEffect(() => {
    setHist((h) => [...h.slice(1), level]);
  }, [level]);
  return (
    <span
      aria-hidden="true"
      className="ml-auto flex h-5 items-center gap-[2px]"
    >
      {hist.map((v, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full bg-raspberry-600",
            v < 0.05 && "opacity-35",
          )}
          style={{ height: `${Math.max(3, Math.round(v * 20))}px` }}
        />
      ))}
    </span>
  );
}
