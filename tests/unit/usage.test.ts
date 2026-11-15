import { describe, expect, it } from "vitest";
import {
  dailySeries,
  forecastMicros,
  formatDuration,
  ledgerCsv,
  parseCapUsd,
  periodDays,
  readOverview,
  type LedgerRow,
} from "@/lib/usage";

const d = (s: string) => new Date(s);

describe("period days and the chart", () => {
  it("lists every UTC day of the period", () => {
    const days = periodDays(d("2026-11-01T00:00Z"), d("2026-12-01T00:00Z"));
    expect(days.length).toBe(30);
    expect(days[0]).toBe("2026-11-01");
    expect(days.at(-1)).toBe("2026-11-30");
  });

  it("stacks kinds per day and leaves empty days at zero", () => {
    const s = dailySeries(
      [
        { day: "2026-11-02", kind: "build", micros: 300 },
        { day: "2026-11-02", kind: "fix", micros: 100 },
      ],
      d("2026-11-01T00:00Z"),
      d("2026-11-04T00:00Z"),
    );
    expect(s).toEqual([
      { day: "2026-11-01", kinds: {}, total: 0 },
      { day: "2026-11-02", kinds: { build: 300, fix: 100 }, total: 400 },
      { day: "2026-11-03", kinds: {}, total: 0 },
    ]);
  });
});

describe("forecast", () => {
  const start = d("2026-11-01T00:00Z");
  const end = d("2026-12-01T00:00Z");

  it("adds the trailing 7-day average for each day left", () => {
    const daily = Array.from({ length: 14 }, (_, i) => ({
      day: `2026-11-${String(i + 1).padStart(2, "0")}`,
      kind: "build" as const,
      micros: i < 7 ? 0 : 1_000_000, // the last 7 days cost $1 a day
    }));
    // Nov 15 00:00: 7 days of history at $1/day, 16 days left.
    expect(
      forecastMicros(7_000_000, daily, start, end, d("2026-11-15T00:00Z")),
    ).toBe(23_000_000);
  });

  it("has nothing to say in the first day or after the period", () => {
    expect(
      forecastMicros(1, [], start, end, d("2026-11-01T10:00Z")),
    ).toBeNull();
    expect(
      forecastMicros(1, [], start, end, d("2026-12-02T00:00Z")),
    ).toBeNull();
  });
});

describe("ledger CSV", () => {
  const row: LedgerRow = {
    id: "g1",
    created_at: "2026-11-14T22:12:00Z",
    project_id: "p1",
    project_name: '=HYPERLINK("x"), pricing',
    user_name: "Steve",
    kind: "ai_copy",
    status: "succeeded",
    version_number: 7,
    input_tokens: 18200,
    output_tokens: 6100,
    duration_ms: 21_400,
    billed_micros: 60_000,
    steps: [{ title: "Layout", status: "done" }],
  };

  it("writes one row per build with dollars and seconds", () => {
    const csv = ledgerCsv([row]).split("\n");
    expect(csv[0]).toBe(
      "time_utc,prototype,kind,status,version,steps,input_tokens,output_tokens,duration_seconds,billed_usd",
    );
    expect(csv[1]).toBe(
      `2026-11-14T22:12:00Z,"'=HYPERLINK(""x""), pricing",AI copy,succeeded,7,1,18200,6100,21.4,0.0600`,
    );
  });

  it("adds who ran each build for team admins", () => {
    expect(ledgerCsv([row], true).split("\n")[0]).toContain(",person,");
  });
});

describe("small formats", () => {
  it("formats durations", () => {
    expect(formatDuration(21_000)).toBe("21 s");
    expect(formatDuration(64_000)).toBe("1 m 04 s");
    expect(formatDuration(null)).toBe("—");
  });

  it("parses a cap typed in dollars", () => {
    expect(parseCapUsd("$25")).toBe(25_000_000);
    expect(parseCapUsd("1,250.50")).toBe(1_250_500_000);
    expect(parseCapUsd("  ")).toBeNull();
    expect(parseCapUsd("-3")).toBe("invalid");
    expect(parseCapUsd("12.345")).toBe("invalid");
  });

  it("reads usage_overview's JSON with bigints as strings", () => {
    const o = readOverview({
      plan: "pro",
      period_start: "2026-11-01T00:00:00Z",
      period_end: "2026-12-01T00:00:00Z",
      usage_micros: "7420000",
      included_micros: 10000000,
      spend_cap_micros: null,
      alert_thresholds: [50, 80],
      by_kind: { build: "5", nonsense: 3 },
      daily: [],
      by_project: [],
      by_member: [],
    });
    expect(o).toMatchObject({
      usage_micros: 7_420_000,
      spend_cap_micros: null,
      by_kind: { build: 5 },
    });
  });
});
