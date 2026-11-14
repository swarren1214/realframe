/** Longest prompt a build accepts. */
export const MAX_PROMPT = 10_000;

/** sessionStorage key for the prompt to run when a new prototype opens. */
export const START_PROMPT_KEY = "rf:start-prompt";

const LEAD =
  /^(?:(?:hi|hey)\b[,!.]?\s+)?(?:please\s+)?(?:(?:i\s+(?:want|need|would like|'d like)|can you|could you|let'?s|help me)\s+)?(?:to\s+)?(?:(?:build|make|create|design|prototype)\s+)?(?:me\s+)?(?:(?:a|an)\s+)?(?:(?:prototype|mockup|mock-up)\s+)?(?:(?:for|of)\s+)?/i;

/**
 * What a new prototype is called. Short text is taken as the name; a longer
 * description is trimmed to its subject, e.g. "I want a prototype for a
 * mobile app for a content creator where…" → "Mobile app for a content creator".
 */
export function nameFromPrompt(text: string): {
  name: string;
  isPrompt: boolean;
} {
  const clean = text.trim().replace(/\s+/g, " ");
  const words = clean.split(" ").filter(Boolean);
  if (words.length <= 5 && !/\n/.test(text.trim()) && clean.length <= 60)
    return { name: clean || "Untitled prototype", isPrompt: false };
  let subject = clean.replace(LEAD, "");
  subject = subject.split(
    /\s+(?:where|that|which|so that|so|with|to help|to let)\s+|[.,;:!?\n]/i,
  )[0];
  subject = subject.replace(/^(?:a|an|the)\s+/i, "").trim();
  if (subject.length > 48) {
    subject = subject.slice(0, 48);
    subject = subject.slice(
      0,
      subject.lastIndexOf(" ") > 20 ? subject.lastIndexOf(" ") : 48,
    );
  }
  if (!subject) subject = clean.slice(0, 40);
  return {
    name: subject[0].toUpperCase() + subject.slice(1),
    isPrompt: true,
  };
}
