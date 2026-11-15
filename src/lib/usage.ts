// The Usage tab's data: types for what usage_overview() and usage_ledger() return,
// plus the pure helpers (forecast, chart series, CSV) shared by the page and the CSV route.

export const USAGE_KINDS = [
  "build",
  "variant",
  "fix",
  "ai_copy",
  "export",
  "voice",
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export const KIND_LABEL: Record<UsageKind, string> = {
  build: "Builds",
  variant: "Variants",
  fix: "Fixes",
  ai_copy: "AI copies",
  export: "Exports",
  voice: "Voice",
};

/** One row's label in the ledger, singular. */
export const KIND_SINGULAR: Record<UsageKind, string> = {
  build: "Build",
  variant: "Variant",
  fix: "Fix",
  ai_copy: "AI copy",
  export: "Export",
  voice: "Voice",
};

export function readKind(v: unknown): UsageKind | null {
  return typeof v === "string" && (USAGE_KINDS as readonly string[]).includes(v)
    ? (v as UsageKind)
    : null;
}

/** Alert thresholds people can pick, as percentages of the included usage. */
export const ALERT_CHOICES = [50, 80, 100, 150] as const;
/** Every threshold the database accepts (a superset of the choices shown). */
export const ALERT_ALLOWED = [25, 50, 75, 80, 90, 100, 150, 200];

export type UsageOverview = {
  plan: "free" | "pro" | "team";
  period_start: string;
  period_end: string;
  usage_micros: number;
  included_micros: number;
  spend_cap_micros: number | null;
  alert_thresholds: number[];
  see_all: boolean;
  builds: number;
  failed: number;
  running: number;
  duration_ms: number;
  by_kind: Partial<Record<UsageKind, number>>;
  daily: { day: string; kind: UsageKind; micros: number }[];
  by_project: {
    project_id: string | null;
    name: string;
    micros: number;
    builds: number;
    failed: number;
  }[];
  by_member: {
    user_id: string;
    name: string;
    micros: number;
    builds: number;
  }[];
};

export type LedgerRow = {
  id: string;
  created_at: string;
  project_id: string | null;
  project_name: string;
  user_name: string | null;
  kind: UsageKind;
  status: "started" | "succeeded" | "failed";
  version_number: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  billed_micros: number;
  steps: { title: string; status: string }[];
};

/** Normalises usage_overview()'s JSON (bigints arrive as numbers or strings). */
export function readOverview(raw: unknown): UsageOverview | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const kinds = (r.by_kind ?? {}) as Record<string, unknown>;
  return {
    plan: (r.plan as UsageOverview["plan"]) ?? "free",
    period_start: String(r.period_start),
    period_end: String(r.period_end),
    usage_micros: n(r.usage_micros),
    included_micros: n(r.included_micros),
    spend_cap_micros:
      r.spend_cap_micros === null || r.spend_cap_micros === undefined
        ? null
        : n(r.spend_cap_micros),
    alert_thresholds: ((r.alert_thresholds as unknown[]) ?? []).map(n),
    see_all: Boolean(r.see_all),
    builds: n(r.builds),
    failed: n(r.failed),
    running: n(r.running),
    duration_ms: n(r.duration_ms),
    by_kind: Object.fromEntries(
      Object.entries(kinds)
        .filter(([k]) => readKind(k))
        .map(([k, v]) => [k, n(v)]),
    ),
    daily: ((r.daily as Record<string, unknown>[]) ?? []).map((d) => ({
      day: String(d.day),
      kind: readKind(d.kind) ?? "build",
      micros: n(d.micros),
    })),
    by_project: ((r.by_project as Record<string, unknown>[]) ?? []).map(
      (p) => ({
        project_id: (p.project_id as string | null) ?? null,
        name: String(p.name ?? ""),
        micros: n(p.micros),
        builds: n(p.builds),
        failed: n(p.failed),
      }),
    ),
    by_member: ((r.by_member as Record<string, unknown>[]) ?? []).map((m) => ({
      user_id: String(m.user_id),
      name: String(m.name ?? ""),
      micros: n(m.micros),
      builds: n(m.builds),
    })),
  };
}

export function readLedger(raw: unknown): LedgerRow[] {
  return ((raw as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: String(r.id),
    created_at: String(r.created_at),
    project_id: (r.project_id as string | null) ?? null,
    project_name: String(r.project_name ?? ""),
    user_name: (r.user_name as string | null) ?? null,
    kind: readKind(r.kind) ?? "build",
    status: (r.status as LedgerRow["status"]) ?? "succeeded",
    version_number:
      r.version_number === null || r.version_number === undefined
        ? null
        : Number(r.version_number),
    input_tokens: r.input_tokens == null ? null : Number(r.input_tokens),
    output_tokens: r.output_tokens == null ? null : Number(r.output_tokens),
    duration_ms: r.duration_ms == null ? null : Number(r.duration_ms),
    billed_micros: Number(r.billed_micros ?? 0),
    steps: Array.isArray(r.steps)
      ? (r.steps as { title?: unknown; status?: unknown }[]).map((s) => ({
          title: String(s.title ?? ""),
          status: String(s.status ?? ""),
        }))
      : [],
  }));
}

const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Every UTC day of the period, as YYYY-MM-DD, first to last. */
export function periodDays(start: Date, end: Date) {
  const out: string[] = [];
  const first = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  for (let t = first; t < end.getTime(); t += DAY)
    out.push(dayKey(new Date(t)));
  return out;
}

/** The chart's columns: one per day of the period, each split by kind. */
export function dailySeries(
  daily: UsageOverview["daily"],
  start: Date,
  end: Date,
) {
  const byDay = new Map<string, Partial<Record<UsageKind, number>>>();
  for (const d of daily) {
    const row = byDay.get(d.day) ?? {};
    row[d.kind] = (row[d.kind] ?? 0) + d.micros;
    byDay.set(d.day, row);
  }
  return periodDays(start, end).map((day) => {
    const kinds = byDay.get(day) ?? {};
    const total = Object.values(kinds).reduce((s, v) => s + (v ?? 0), 0);
    return { day, kinds, total };
  });
}

/**
 * Where this period's billed usage will land at the current pace: what's been billed,
 * plus the trailing 7-day daily average for each day left. Null early in a period, when
 * there isn't a day of history to go on.
 */
export function forecastMicros(
  usageMicros: number,
  daily: UsageOverview["daily"],
  start: Date,
  end: Date,
  now: Date,
) {
  const elapsedMs = now.getTime() - start.getTime();
  if (elapsedMs < DAY || now >= end) return null;
  const from = new Date(Math.max(start.getTime(), now.getTime() - 7 * DAY));
  const fromKey = dayKey(from);
  const recent = daily
    .filter((d) => d.day >= fromKey)
    .reduce((s, d) => s + d.micros, 0);
  const days = Math.max((now.getTime() - from.getTime()) / DAY, 1);
  const left = (end.getTime() - now.getTime()) / DAY;
  return Math.round(usageMicros + (recent / days) * left);
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote anything with a delimiter, and defuse spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The ledger as CSV: one row per build, amounts in dollars. */
export function ledgerCsv(rows: LedgerRow[], withPeople = false) {
  const head = [
    "time_utc",
    "prototype",
    ...(withPeople ? ["person"] : []),
    "kind",
    "status",
    "version",
    "steps",
    "input_tokens",
    "output_tokens",
    "duration_seconds",
    "billed_usd",
  ];
  const lines = rows.map((r) =>
    [
      r.created_at,
      r.project_name,
      ...(withPeople ? [r.user_name ?? ""] : []),
      KIND_SINGULAR[r.kind],
      r.status,
      r.version_number ?? "",
      r.steps.length || "",
      r.input_tokens ?? "",
      r.output_tokens ?? "",
      r.duration_ms == null ? "" : (r.duration_ms / 1000).toFixed(1),
      (r.billed_micros / 1_000_000).toFixed(4),
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}

/** "21 s", "1 m 04 s". */
export function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, "0")} s`;
}

/** "18.2k". */
export function formatTokens(n: number | null) {
  if (n == null) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Parses a dollar amount typed into the cap field into micros; null clears the cap. */
export function parseCapUsd(raw: string): number | null | "invalid" {
  const s = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "invalid";
  const micros = Math.round(Number(s) * 1_000_000);
  return micros > 100_000 * 1_000_000 ? "invalid" : micros;
}
