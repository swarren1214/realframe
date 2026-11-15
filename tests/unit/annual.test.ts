import { describe, expect, it, vi } from "vitest";
import {
  PLANS,
  annualSavingsPercent,
  perMonthOf,
  priceLabel,
  readInterval,
} from "@/lib/plans";
import {
  addMonths,
  finishedWindows,
  windowsToBill,
  microsToCents,
  overageMicros,
  usageWindow,
} from "@/lib/usage-window";

const d = (s: string) => new Date(s);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("plan facts", () => {
  it("prices annual at $200: two months free", () => {
    expect(PLANS.pro.annualUsd).toBe(200);
    expect(
      annualSavingsPercent(PLANS.pro.monthlyUsd, PLANS.pro.annualUsd),
    ).toBe(17);
    expect(perMonthOf(200)).toBe("$16.67");
    expect(priceLabel("pro", "year")).toBe("$200/year");
    expect(priceLabel("team", "month")).toBe("$20/month");
  });
  it("defaults anything unexpected to monthly", () => {
    expect(readInterval("year")).toBe("year");
    expect(readInterval("YEAR")).toBe("month");
    expect(readInterval(null)).toBe("month");
  });
});

describe("usage windows", () => {
  it("clamps month-end anchors like Stripe", () => {
    const a = d("2026-01-31T00:00:00Z");
    expect([1, 2, 3, 13].map((n) => iso(addMonths(a, n)))).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2027-02-28",
    ]);
    expect(iso(addMonths(d("2028-01-31T00:00:00Z"), 1))).toBe("2028-02-29");
  });
  it("finds the window containing a moment, including the exact boundary", () => {
    const a = d("2026-03-10T12:00:00Z");
    const w = usageWindow(a, d("2026-05-10T12:00:00Z"));
    expect([iso(w.start), iso(w.end)]).toEqual(["2026-05-10", "2026-06-10"]);
    const before = usageWindow(a, d("2026-05-10T11:59:59Z"));
    expect(iso(before.start)).toBe("2026-04-10");
  });
  it("works for moments before the anchor (last year's usage)", () => {
    const w = usageWindow(d("2026-03-10T00:00:00Z"), d("2026-01-20T00:00:00Z"));
    expect([iso(w.start), iso(w.end)]).toEqual(["2026-01-10", "2026-02-10"]);
  });
  it("lists finished windows oldest first", () => {
    const ws = finishedWindows(
      d("2026-01-01T00:00:00Z"),
      d("2026-04-15T00:00:00Z"),
    );
    expect(ws.map((w) => iso(w.start))).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });
  it("rounds overage up to the cent and never goes negative", () => {
    expect(overageMicros(12_000_000, 10_000_000)).toBe(2_000_000);
    expect(overageMicros(3, 10)).toBe(0);
    expect(microsToCents(2_000_001)).toBe(201);
  });
});

describe("windows to bill", () => {
  it("reaches back past the anchor, so the months before a renewal are still billed", () => {
    const ws = windowsToBill(
      d("2026-01-15T00:00:00Z"),
      d("2026-04-20T00:00:00Z"),
    );
    expect(iso(ws[0].start)).toBe("2025-03-15");
    expect(ws.map((w) => iso(w.start)).slice(-4)).toEqual([
      "2025-12-15",
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
    ]);
  });
  it("leaves the current, unfinished month alone", () => {
    const ws = windowsToBill(
      d("2026-01-15T00:00:00Z"),
      d("2026-04-20T00:00:00Z"),
    );
    expect(ws.at(-1)!.end <= d("2026-04-20T00:00:00Z")).toBe(true);
  });
});

describe("checkout line items", () => {
  it("uses the monthly price for monthly plans", async () => {
    const { checkoutLineItem, PRO_PRICE_ID } = await import("@/lib/stripe");
    const getProduct = vi.fn();
    expect(await checkoutLineItem("pro", "month", 1, getProduct)).toEqual({
      price: PRO_PRICE_ID,
      quantity: 1,
    });
    expect(getProduct).not.toHaveBeenCalled();
  });
  it("builds a $200/year price on the monthly price's product when no annual price is set", async () => {
    const { checkoutLineItem, TEAM_PRICE_ID } = await import("@/lib/stripe");
    const getProduct = vi.fn(async () => "prod_team");
    expect(await checkoutLineItem("team", "year", 4, getProduct)).toEqual({
      quantity: 4,
      price_data: {
        currency: "usd",
        product: "prod_team",
        unit_amount: 20_000,
        recurring: { interval: "year" },
      },
    });
    expect(getProduct).toHaveBeenCalledWith(TEAM_PRICE_ID);
  });
  it("uses a configured annual price when there is one", async () => {
    vi.resetModules();
    vi.stubEnv("STRIPE_PRO_ANNUAL_PRICE_ID", "price_pro_year");
    const { checkoutLineItem } = await import("@/lib/stripe");
    expect(await checkoutLineItem("pro", "year", 1, vi.fn())).toEqual({
      price: "price_pro_year",
      quantity: 1,
    });
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("reads a subscription's interval", async () => {
    const { intervalOf } = await import("@/lib/stripe");
    const sub = (interval: string) =>
      ({ items: { data: [{ price: { recurring: { interval } } }] } }) as never;
    expect(intervalOf(sub("year"))).toBe("year");
    expect(intervalOf(sub("month"))).toBe("month");
  });
});
