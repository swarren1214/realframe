// Model cost per million tokens in USD. Override with env vars if pricing changes.
const INPUT_USD_PER_MTOK = Number(process.env.REALFRAME_INPUT_USD_PER_MTOK || 3);
const OUTPUT_USD_PER_MTOK = Number(process.env.REALFRAME_OUTPUT_USD_PER_MTOK || 15);

/** Raw model cost of one build in micro-USD (1 USD = 1,000,000). */
export function costMicros(inputTokens: number | null, outputTokens: number | null) {
  // $X per million tokens is exactly X micro-USD per token.
  return Math.round((inputTokens ?? 0) * INPUT_USD_PER_MTOK + (outputTokens ?? 0) * OUTPUT_USD_PER_MTOK);
}

export function formatUsd(micros: number, digits = 2) {
  return (micros / 1_000_000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export type Quota = {
  plan: "free" | "pro";
  build_limit: number;
  used: number;
  remaining: number;
  period_start: string;
  period_end: string;
  usage_micros: number;
  included_micros: number;
};
