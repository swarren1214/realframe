// Voice: the parts of dictation that don't need a browser, so they can be tested.

/** A few short phrases run without AI. Only a whole utterance counts, so prompts never trigger them. */
export type VoiceCommand =
  | { kind: "send" }
  | { kind: "cancel" }
  | { kind: "version"; number: number }
  | { kind: "inspect" };

const WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  to: 2,
  too: 2,
  for: 4,
  won: 1,
};

export function voiceCommand(utterance: string): VoiceCommand | null {
  const t = utterance
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(send|send it|build it|go ahead)$/.test(t)) return { kind: "send" };
  if (/^(cancel|never ?mind|scratch that|clear that)$/.test(t))
    return { kind: "cancel" };
  if (/^(open dev mode|dev mode|inspect|open inspector)$/.test(t))
    return { kind: "inspect" };
  const v = /^(?:go to|show|open|switch to) (?:version|v) ?([a-z]+|\d+)$/.exec(
    t,
  );
  if (v) {
    const n = /^\d+$/.test(v[1]) ? Number(v[1]) : WORDS[v[1]];
    if (n && n > 0) return { kind: "version", number: n };
  }
  return null;
}

/** Adds dictated text to what's already in the box, with a space and sentence case where it fits. */
export function appendTranscript(current: string, spoken: string) {
  const add = spoken.trim();
  if (!add) return current;
  const base = current.replace(/\s+$/, "");
  if (!base) return add[0].toUpperCase() + add.slice(1);
  const startsSentence = /[.!?]$/.test(base);
  const piece = startsSentence ? add[0].toUpperCase() + add.slice(1) : add;
  return `${base} ${piece}`;
}

/** "0:04". */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Where the words were turned into text, for the note under the mic. */
export type VoiceMode = "device" | "browser";
export const MODE_NOTE: Record<VoiceMode, string> = {
  device: "Transcribed on this device",
  browser: "Transcribed by your browser's speech service",
};
