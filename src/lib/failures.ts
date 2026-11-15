/**
 * Build failures in plain words. Each known kind gets one sentence and the one
 * action most likely to help; anything else falls back to a generic message.
 */
export type FailureKind =
  "cutoff" | "timeout" | "broken" | "busy" | "limit" | "other";

export type Failure = {
  kind: FailureKind;
  title: string;
  detail: string;
  /** Whether Retry should ask for a plan with smaller steps. */
  smaller: boolean;
  /** Whether retrying can help at all. */
  retry: boolean;
};

const PREFIX = "That didn't work: ";

/** True for the chat messages builds leave behind when they fail. */
export function isFailureMessage(content: string) {
  return content.startsWith(PREFIX);
}

export function describeFailure(raw: string): Failure {
  const msg = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
  const m = msg.toLowerCase();
  if (
    /limit_reached|limit reached|out of builds|daily limit|free builds/.test(m)
  )
    return {
      kind: "limit",
      title: "You've used all your builds for now",
      detail: msg,
      smaller: false,
      retry: false,
    };
  if (
    /complete html|cut off|ran out of room|too big|max_tokens|incomplete/.test(
      m,
    )
  )
    return {
      kind: "cutoff",
      title: "The build ran out of room before it finished",
      detail:
        "That was a lot to build in one pass. Retry splits it into smaller steps.",
      smaller: true,
      retry: true,
    };
  if (/timed? ?out|timeout|took too long|504|function_invocation/.test(m))
    return {
      kind: "timeout",
      title: "That took longer than five minutes",
      detail: "Retry, or ask for a bit less at once.",
      smaller: true,
      retry: true,
    };
  if (/load check|threw|broken page|error on load|failed to load/.test(m))
    return {
      kind: "broken",
      title: "The page had an error when it loaded",
      detail: "It wasn't saved, so nothing changed. Retrying usually fixes it.",
      smaller: false,
      retry: true,
    };
  if (/overloaded|rate limit|529|503|busy|temporarily/.test(m))
    return {
      kind: "busy",
      title: "The AI service is busy right now",
      detail: "Give it a moment, then retry.",
      smaller: false,
      retry: true,
    };
  return {
    kind: "other",
    title: "Something went wrong on our side",
    detail: msg,
    smaller: false,
    retry: true,
  };
}
