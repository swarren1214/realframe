// Monthly usage windows. Included AI usage resets every month, also on annual plans, so usage is
// measured in one-month windows counted from the subscription's start (its anchor). Matches
// public.usage_window() in the database: Jan 31 → Feb 28 (29) → Mar 31 → Apr 30 …

export type Window = { start: Date; end: Date };

/** anchor + n calendar months, clamped to the end of shorter months (like Stripe and Postgres). */
export function addMonths(anchor: Date, n: number) {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/** The one-month window, counted from `anchor`, that contains `at`. */
export function usageWindow(anchor: Date, at: Date): Window {
  let n =
    (at.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (at.getUTCMonth() - anchor.getUTCMonth());
  if (addMonths(anchor, n) > at) n -= 1;
  return { start: addMonths(anchor, n), end: addMonths(anchor, n + 1) };
}

/**
 * Every whole window between `anchor` and `before` (exclusive), oldest first. Used by the
 * billing cron to find months that have ended and may still have unbilled usage.
 */
export function finishedWindows(anchor: Date, before: Date, max = 13) {
  const out: Window[] = [];
  for (let n = 0; n < 1200; n++) {
    const w = { start: addMonths(anchor, n), end: addMonths(anchor, n + 1) };
    if (w.end > before) break;
    out.push(w);
  }
  return out.slice(-max);
}

/**
 * Windows that ended before `now` and within the last `days`, oldest first, counted from
 * `anchor` in both directions. Reaches back past the anchor, so the months just before an
 * annual renewal (which moves the anchor) are still found.
 */
export function windowsToBill(anchor: Date, now: Date, days = 400) {
  const since = now.getTime() - days * 86_400_000;
  const out: Window[] = [];
  for (let n = -Math.ceil(days / 28) - 1; n < 1200; n++) {
    const w = { start: addMonths(anchor, n), end: addMonths(anchor, n + 1) };
    if (w.end > now) break;
    if (w.end.getTime() > since) out.push(w);
  }
  return out;
}

/** Overage in micro-USD for a window: usage beyond what's included, never negative. */
export function overageMicros(billedMicros: number, includedMicros: number) {
  return Math.max(0, billedMicros - includedMicros);
}

/** Stripe amounts are in cents; usage is in micro-USD. Rounds up so we never undercharge by a fraction. */
export const microsToCents = (micros: number) => Math.ceil(micros / 10_000);
