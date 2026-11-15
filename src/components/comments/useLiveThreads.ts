"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { mergeThreads } from "@/lib/threads";

/**
 * Threads kept current without reloading the page: tell it which threads changed (or null for
 * "something did"), and a moment later it loads just those and merges them in. Changes that
 * arrive together are loaded together. Resets whenever the page hands it a new list.
 */
export function useLiveThreads<T extends { id: string; created_at: string }>(
  initial: T[],
  load: (ids: string[] | null) => Promise<T[] | null>,
  delayMs = 400,
) {
  const [threads, setThreads] = useState(initial);
  useEffect(() => setThreads(initial), [initial]);
  const pending = useRef<Set<string> | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const flush = useCallback(async () => {
    timer.current = null;
    const ids = pending.current === null ? null : [...(pending.current ?? [])];
    pending.current = undefined;
    const loaded = await loadRef.current(ids).catch(() => null);
    if (loaded) setThreads((cur) => mergeThreads(cur, loaded, ids));
  }, []);

  const changed = useCallback(
    (ids: (string | null | undefined)[] | null) => {
      const known = ids?.filter((x): x is string => Boolean(x));
      if (ids === null || !known?.length) pending.current = null;
      else if (pending.current !== null) {
        pending.current ??= new Set();
        for (const id of known) pending.current.add(id);
      }
      if (!timer.current)
        timer.current = setTimeout(() => void flush(), delayMs);
    },
    [flush, delayMs],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { threads, changed, reload: () => changed(null) };
}
