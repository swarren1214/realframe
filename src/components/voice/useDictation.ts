"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceMode } from "@/lib/voice";

// The Web Speech API's recognition interface, which TypeScript's DOM types don't include yet.
type Recognition = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = {
  new (): Recognition;
  available?: (o: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
  install?: (o: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<boolean>;
};

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (
    ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      RecognitionCtor | undefined) ?? null
  );
}

export function dictationSupported() {
  return (
    Boolean(recognitionCtor()) &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices
  );
}

export type DictationState =
  | { status: "idle" }
  | { status: "preparing"; note: string }
  | { status: "listening"; startedAt: number; interim: string; mode: VoiceMode }
  | { status: "error"; message: string };

const ERRORS: Record<string, string> = {
  "not-allowed":
    "Microphone access is blocked. Allow it in your browser's site settings, then try again.",
  "service-not-allowed":
    "Your browser won't run speech recognition here. Allow it in site settings, or type instead.",
  "audio-capture":
    "No microphone was found. Plug one in or check your system's sound settings.",
  network:
    "Your browser's speech service couldn't be reached. Check your connection and try again.",
  "language-not-supported":
    "Your browser doesn't recognise speech in this language yet.",
};

/** How long a pause ends dictation. */
const SILENCE_MS = 1500;

/**
 * Dictation with the browser's own speech recognition: on-device where the browser supports
 * it (installing the language pack once if needed), otherwise the browser's standard service.
 * Audio never reaches Realframe. `level` is the live input level, 0 to 1, for a meter.
 */
export function useDictation(opts: {
  onFinal: (text: string) => void;
  onStop?: (gotText: boolean) => void;
}) {
  const [state, setState] = useState<DictationState>({ status: "idle" });
  const [level, setLevel] = useState(0);
  const rec = useRef<Recognition | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const silence = useRef(0);
  const got = useRef(false);
  const latest = useRef(opts);
  latest.current = opts;

  const cleanup = useCallback(() => {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(silence.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audio.current?.close().catch(() => undefined);
    audio.current = null;
    setLevel(0);
  }, []);

  useEffect(
    () => () => {
      rec.current?.abort();
      cleanup();
    },
    [cleanup],
  );

  const stop = useCallback(() => {
    window.clearTimeout(silence.current);
    rec.current?.stop();
  }, []);

  const cancel = useCallback(() => {
    got.current = false;
    rec.current?.abort();
  }, []);

  const start = useCallback(async () => {
    const Ctor = recognitionCtor();
    if (!Ctor || !navigator.mediaDevices) {
      setState({
        status: "error",
        message:
          "This browser can't take voice input. Try Chrome, Edge, Safari or Firefox.",
      });
      return;
    }
    if (rec.current) return;
    const lang = navigator.language || "en-US";
    got.current = false;

    // Ask for the microphone first: it gives one clear permission prompt and drives the meter.
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    } catch (e) {
      const denied = (e as Error).name === "NotAllowedError";
      setState({
        status: "error",
        message: denied ? ERRORS["not-allowed"] : ERRORS["audio-capture"],
      });
      return;
    }

    // On-device when the browser can; the language pack downloads once (about 60 MB in Chrome).
    let mode: VoiceMode = "browser";
    if (Ctor.available) {
      try {
        const opt = { langs: [lang], processLocally: true };
        let status = await Ctor.available(opt);
        if (
          (status === "downloadable" || status === "downloading") &&
          Ctor.install
        ) {
          setState({
            status: "preparing",
            note: "Getting on-device speech ready. This happens once.",
          });
          status = (await Ctor.install(opt)) ? "available" : status;
        }
        if (status === "available") mode = "device";
      } catch {
        mode = "browser";
      }
    }

    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    if (mode === "device") r.processLocally = true;
    rec.current = r;
    const startedAt = Date.now();
    const armSilence = () => {
      window.clearTimeout(silence.current);
      silence.current = window.setTimeout(() => r.stop(), SILENCE_MS);
    };

    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript ?? "";
        if (res.isFinal) {
          if (text.trim()) {
            got.current = true;
            latest.current.onFinal(text);
          }
        } else interim += text;
      }
      setState({ status: "listening", startedAt, interim, mode });
      armSilence();
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setState({
        status: "error",
        message:
          ERRORS[e.error] ?? "Voice input stopped unexpectedly. Try again.",
      });
    };
    r.onend = () => {
      rec.current = null;
      cleanup();
      setState((s) => (s.status === "error" ? s : { status: "idle" }));
      latest.current.onStop?.(got.current);
    };

    // A live level meter from the same microphone.
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream.current).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* the meter is decoration; dictation works without it */
    }

    try {
      r.start();
      setState({ status: "listening", startedAt, interim: "", mode });
      // Stop if nothing is said at all.
      silence.current = window.setTimeout(() => r.stop(), 8000);
    } catch {
      rec.current = null;
      cleanup();
      setState({
        status: "error",
        message: "Voice input couldn't start. Try again.",
      });
    }
  }, [cleanup]);

  const dismiss = useCallback(() => setState({ status: "idle" }), []);

  return { state, level, start, stop, cancel, dismiss };
}
