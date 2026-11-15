// billUsageWindow: each account and month is billed once, however often billing runs.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe", () => ({ USAGE_PRODUCT_ID: "prod_usage" }));

type Ledger = { id: string; invoice_id: string | null };

let totals: { billed_micros: number; builds: number };
let ledger: Map<string, Ledger>;
let stamps: string[];
let invoices: {
  id: string;
  status: string;
  metadata: Record<string, string>;
}[];
let lines: Map<string, { metadata: Record<string, string> }[]>;
let created: { invoices: number; items: number; finalized: number };

const admin = {
  rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "unbilled_usage") return { data: [totals], error: null };
    if (name === "claim_usage_bill") {
      const key = `${args.p_kind}:${args.p_account}:${args.p_start}`;
      if (!ledger.has(key)) ledger.set(key, { id: key, invoice_id: null });
      return { data: { ...ledger.get(key)! }, error: null };
    }
    if (name === "stamp_usage") {
      stamps.push(String(args.p_stamp));
      return { data: totals.builds, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  }),
  from: () => ({
    update: (patch: { invoice_id?: string }) => ({
      eq: async (_col: string, id: string) => {
        const row = ledger.get(id);
        if (row && patch.invoice_id) row.invoice_id = patch.invoice_id;
        return { error: null };
      },
    }),
  }),
};

const stripe = {
  invoices: {
    search: vi.fn(async ({ query }: { query: string }) => ({
      data: invoices.filter((i) => query.includes(i.metadata.usage_key)),
    })),
    create: vi.fn(async (p: { metadata: Record<string, string> }) => {
      created.invoices++;
      const inv = {
        id: `in_${created.invoices}`,
        status: "draft",
        metadata: p.metadata,
      };
      invoices.push(inv);
      return inv;
    }),
    listLineItems: vi.fn(async (id: string) => ({ data: lines.get(id) ?? [] })),
    finalizeInvoice: vi.fn(async (id: string) => {
      created.finalized++;
      invoices.find((i) => i.id === id)!.status = "open";
      return {};
    }),
  },
  invoiceItems: {
    create: vi.fn(
      async (p: { invoice: string; metadata: Record<string, string> }) => {
        created.items++;
        lines.set(p.invoice, [
          ...(lines.get(p.invoice) ?? []),
          { metadata: p.metadata },
        ]);
        return {};
      },
    ),
  },
};

const account = { kind: "user" as const, id: "u1", customerId: "cus_1" };
const window = {
  start: new Date("2026-03-15T00:00:00Z"),
  end: new Date("2026-04-15T00:00:00Z"),
};
const bill = async (renewal?: { id: string; currency: string }) => {
  const { billUsageWindow } = await import("@/lib/usage-billing");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return billUsageWindow(
    admin as any,
    stripe as any,
    account,
    window,
    10_000_000,
    renewal,
  );
};

beforeEach(() => {
  totals = { billed_micros: 13_000_000, builds: 2500 };
  ledger = new Map();
  stamps = [];
  invoices = [];
  lines = new Map();
  created = { invoices: 0, items: 0, finalized: 0 };
  vi.clearAllMocks();
});

describe("annual usage invoices", () => {
  it("bills the overage once and stamps every build in the month", async () => {
    const r = await bill();
    expect(r).toMatchObject({ builds: 2500, cents: 300, invoiceId: "in_1" });
    expect(created).toEqual({ invoices: 1, items: 1, finalized: 1 });
    expect(stamps).toEqual(["in_1"]);
  });

  it("never makes a second invoice for the same month", async () => {
    await bill();
    await bill();
    expect(created.invoices).toBe(1);
    expect(created.items).toBe(1);
    expect(stamps).toEqual(["in_1", "in_1"]);
  });

  it("picks up a draft an interrupted run left behind instead of making another", async () => {
    // A run made the draft, then died before saving it in the ledger.
    invoices.push({
      id: "in_old",
      status: "draft",
      metadata: { usage_key: `usage-cus_1-${window.start.toISOString()}` },
    });
    const r = await bill();
    expect(r.invoiceId).toBe("in_old");
    expect(created).toEqual({ invoices: 0, items: 1, finalized: 1 });
    expect(stamps).toEqual(["in_old"]);
  });

  it("stamps without invoicing when usage stayed within the allowance", async () => {
    totals = { billed_micros: 4_000_000, builds: 30 };
    const r = await bill();
    expect(r.cents).toBe(0);
    expect(created).toEqual({ invoices: 0, items: 0, finalized: 0 });
    expect(stamps[0]).toMatch(/^included-cus_1-/);
  });

  it("does nothing for a month with no unbilled builds", async () => {
    totals = { billed_micros: 0, builds: 0 };
    await bill();
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(stamps).toEqual([]);
  });
});

describe("monthly renewal invoices", () => {
  it("adds the overage line once, even when the webhook is retried", async () => {
    const renewal = { id: "in_renewal", currency: "usd" };
    await bill(renewal);
    await bill(renewal);
    expect(created.items).toBe(1);
    expect(created.invoices).toBe(0);
    expect(stamps).toEqual(["in_renewal", "in_renewal"]);
  });
});
