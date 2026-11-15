// Checkout, the Stripe webhook and the annual usage cron, with Supabase and Stripe faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type Handler } from "./fake-supabase";

const state: {
  server: ReturnType<typeof fakeSupabase>;
  admin: ReturnType<typeof fakeSupabase>;
  stripe: ReturnType<typeof makeStripe>;
} = {} as never;

function makeStripe() {
  return {
    customers: { create: vi.fn(async () => ({ id: "cus_new" })) },
    checkout: {
      sessions: {
        create: vi.fn(async (_p: unknown) => ({
          url: "https://checkout.stripe.com/c/test",
        })),
      },
    },
    prices: { retrieve: vi.fn(async () => ({ product: "prod_pro" })) },
    subscriptions: { retrieve: vi.fn() },
    invoices: {
      create: vi.fn(async () => ({ id: "in_usage_1", status: "draft" })),
      search: vi.fn(async () => ({ data: [] })),
      listLineItems: vi.fn(async () => ({ data: [] })),
      finalizeInvoice: vi.fn(async () => ({})),
    },
    invoiceItems: { create: vi.fn(async () => ({ id: "ii_1" })) },
    webhooks: { constructEvent: vi.fn() },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => state.server.client,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => state.admin.client,
}));
vi.mock("@/lib/stripe", async (orig) => {
  const real = await orig<typeof import("@/lib/stripe")>();
  return {
    ...real,
    getStripe: () => state.stripe,
    productOf: async () => "prod_pro",
  };
});

const user = { id: "u1", email: "steve@acme.co" };

/** The billing functions in the database, over a list of builds. */
function usageRpc(
  c: { rpc?: string; args?: unknown },
  rows: { billed_micros: number; created_at: string }[],
) {
  const a = c.args as { p_from: string; p_to: string; p_stamp?: string };
  const inWindow = rows.filter(
    (r) => r.created_at >= a.p_from && r.created_at < a.p_to,
  );
  if (c.rpc === "unbilled_usage")
    return {
      data: [
        {
          billed_micros: inWindow.reduce((n, r) => n + r.billed_micros, 0),
          builds: inWindow.length,
        },
      ],
    };
  if (c.rpc === "claim_usage_bill")
    return { data: { id: `bill-${a.p_from}`, invoice_id: null } };
  if (c.rpc === "stamp_usage") return { data: inWindow.length };
}

function setup(
  server: Handler = () => undefined,
  admin: Handler = () => undefined,
  signedIn = true,
) {
  state.server = fakeSupabase(server, signedIn ? user : null);
  state.admin = fakeSupabase(admin);
  state.stripe = makeStripe();
}

const form = (fields: Record<string, string>) => {
  const body = new URLSearchParams(fields);
  return new NextRequest("https://www.realframe.app/api/billing/checkout", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
};

beforeEach(() => setup());
afterEach(() => vi.clearAllMocks());

describe("Pro checkout", () => {
  it("sends signed-out visitors to sign in", async () => {
    setup(undefined, undefined, false);
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(form({}));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("next=/billing");
  });

  it("opens Checkout with the monthly price by default", async () => {
    setup(undefined, (c) =>
      c.table === "profiles" && c.op === "select"
        ? { data: { plan: "free", stripe_customer_id: "cus_1" } }
        : undefined,
    );
    const { POST } = await import("@/app/api/billing/checkout/route");
    const { PRO_PRICE_ID } = await import("@/lib/stripe");
    const res = await POST(form({}));
    expect(res.headers.get("location")).toBe(
      "https://checkout.stripe.com/c/test",
    );
    const params = state.stripe.checkout.sessions.create.mock.calls[0][0] as {
      line_items: unknown[];
      customer: string;
    };
    expect(params.customer).toBe("cus_1");
    expect(params.line_items).toEqual([{ price: PRO_PRICE_ID, quantity: 1 }]);
  });

  it("opens Checkout with $200/year when annual is picked", async () => {
    setup(undefined, (c) =>
      c.table === "profiles" && c.op === "select"
        ? { data: { plan: "free", stripe_customer_id: "cus_1" } }
        : undefined,
    );
    const { POST } = await import("@/app/api/billing/checkout/route");
    await POST(form({ interval: "year" }));
    const params = state.stripe.checkout.sessions.create.mock.calls[0][0] as {
      line_items: {
        price_data: { unit_amount: number; recurring: { interval: string } };
      }[];
      subscription_data: { metadata: Record<string, string> };
    };
    expect(params.line_items[0].price_data.unit_amount).toBe(20_000);
    expect(params.line_items[0].price_data.recurring.interval).toBe("year");
    expect(params.subscription_data.metadata.billing_interval).toBe("year");
  });

  it("doesn't start a second subscription for someone already on Pro", async () => {
    setup(undefined, (c) =>
      c.table === "profiles" ? { data: { plan: "pro" } } : undefined,
    );
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(form({}));
    expect(res.headers.get("location")).toContain("/billing");
    expect(state.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("Team checkout", () => {
  it("charges one seat per builder, not per reviewer", async () => {
    setup(
      (c) => (c.rpc === "team_role" ? { data: "admin" } : undefined),
      (c) => {
        if (c.table === "teams")
          return {
            data: {
              name: "Acme",
              personal: false,
              plan: "free",
              stripe_customer_id: "cus_t",
            },
          };
        if (c.table === "team_members") {
          expect(c.filters).toContainEqual(["in", "role", ["admin", "member"]]);
          return { count: 3 };
        }
      },
    );
    const { POST } = await import("@/app/api/billing/team-checkout/route");
    await POST(form({ team_id: "t1", interval: "year" }));
    const params = state.stripe.checkout.sessions.create.mock.calls[0][0] as {
      line_items: { quantity: number }[];
    };
    expect(params.line_items[0].quantity).toBe(3);
  });

  it("only lets admins upgrade", async () => {
    setup((c) => (c.rpc === "team_role" ? { data: "reviewer" } : undefined));
    const { POST } = await import("@/app/api/billing/team-checkout/route");
    const res = await POST(form({ team_id: "t1" }));
    expect(res.headers.get("location")).toContain("Only%20admins");
    expect(state.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("Stripe webhook", () => {
  const event = (type: string, object: unknown) => ({ type, data: { object } });
  const req = () =>
    new NextRequest("https://www.realframe.app/api/stripe/webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "t=1,v1=x" },
    });

  beforeEach(() => vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test"));
  afterEach(() => vi.unstubAllEnvs());

  it("rejects requests with a bad signature", async () => {
    state.stripe.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("bad");
    });
    const { POST } = await import("@/app/api/stripe/webhook/route");
    expect((await POST(req())).status).toBe(400);
  });

  it("stores plan, period and billing interval from the subscription", async () => {
    const sub = {
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      cancel_at_period_end: false,
      metadata: { supabase_user_id: "u1" },
      items: {
        data: [
          {
            current_period_start: 1_767_225_600,
            current_period_end: 1_798_761_600,
            price: { recurring: { interval: "year" } },
          },
        ],
      },
    };
    state.stripe.webhooks.constructEvent.mockReturnValue(
      event("customer.subscription.updated", sub),
    );
    const { POST } = await import("@/app/api/stripe/webhook/route");
    expect((await POST(req())).status).toBe(200);
    const upd = state.admin.calls.find(
      (c) => c.table === "profiles" && c.op === "update",
    )!;
    expect(upd.values).toMatchObject({
      plan: "pro",
      billing_interval: "year",
      stripe_subscription_id: "sub_1",
    });
    expect(upd.filters).toContainEqual(["eq", "id", "u1"]);
  });

  it("drops a cancelled subscription back to Free", async () => {
    const sub = {
      id: "sub_1",
      status: "canceled",
      customer: "cus_1",
      metadata: {},
      items: { data: [{ price: { recurring: { interval: "month" } } }] },
    };
    state.stripe.webhooks.constructEvent.mockReturnValue(
      event("customer.subscription.deleted", sub),
    );
    const { POST } = await import("@/app/api/stripe/webhook/route");
    await POST(req());
    const upd = state.admin.calls.find(
      (c) => c.table === "profiles" && c.op === "update",
    )!;
    expect(upd.values).toMatchObject({
      plan: "free",
      stripe_subscription_id: null,
    });
    expect(upd.filters).toContainEqual(["eq", "stripe_customer_id", "cus_1"]);
  });

  it("saves the subscription as it is now, not as an older event said", async () => {
    const older = {
      id: "sub_1",
      status: "past_due",
      customer: "cus_1",
      metadata: {},
      items: { data: [{ price: { recurring: { interval: "month" } } }] },
    };
    state.stripe.subscriptions.retrieve.mockResolvedValue({
      ...older,
      status: "active",
    });
    state.stripe.webhooks.constructEvent.mockReturnValue(
      event("customer.subscription.updated", older),
    );
    const { POST } = await import("@/app/api/stripe/webhook/route");
    await POST(req());
    expect(state.stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_1");
    const upd = state.admin.calls.find(
      (c) => c.table === "profiles" && c.op === "update",
    )!;
    expect(upd.values).toMatchObject({
      plan: "pro",
      subscription_status: "active",
    });
  });

  const invoice = {
    id: "in_1",
    customer: "cus_1",
    billing_reason: "subscription_cycle",
    status: "draft",
    currency: "usd",
    period_start: 1_767_225_600,
    period_end: 1_769_904_000,
  };

  it("adds one overage line to a monthly renewal invoice", async () => {
    state.admin = fakeSupabase((c) => {
      if (c.table === "profiles")
        return { data: { id: "u1", billing_interval: "month" } };
      if (c.table === "teams") return { data: null };
      if (c.rpc === "plan_settings")
        return { data: [{ pro_included_micros: 10_000_000 }] };
      if (c.rpc)
        return usageRpc(c, [
          { billed_micros: 8_000_000, created_at: "2026-01-05T00:00:00.000Z" },
          { billed_micros: 4_500_001, created_at: "2026-01-20T00:00:00.000Z" },
        ]);
    });
    state.stripe.webhooks.constructEvent.mockReturnValue(
      event("invoice.created", invoice),
    );
    const { POST } = await import("@/app/api/stripe/webhook/route");
    await POST(req());
    expect(state.stripe.invoiceItems.create).toHaveBeenCalledTimes(1);
    const [item, opts] = state.stripe.invoiceItems.create.mock
      .calls[0] as unknown as [
      { amount: number; invoice: string },
      { idempotencyKey: string },
    ];
    expect(item.amount).toBe(251);
    expect(item.invoice).toBe("in_1");
    expect(opts.idempotencyKey).toBe("overage-in_1");
    const stamped = state.admin.calls.find((c) => c.rpc === "stamp_usage")!;
    expect(stamped.args).toMatchObject({ p_user: "u1", p_stamp: "in_1" });
  });

  it("leaves annual renewals to the monthly usage cron", async () => {
    state.admin = fakeSupabase((c) => {
      if (c.table === "profiles")
        return { data: { id: "u1", billing_interval: "year" } };
      if (c.rpc === "plan_settings")
        return { data: [{ pro_included_micros: 10_000_000 }] };
    });
    state.stripe.webhooks.constructEvent.mockReturnValue(
      event("invoice.created", invoice),
    );
    const { POST } = await import("@/app/api/stripe/webhook/route");
    await POST(req());
    expect(state.stripe.invoiceItems.create).not.toHaveBeenCalled();
    expect(state.admin.calls.some((c) => c.rpc === "stamp_usage")).toBe(false);
  });
});

describe("annual usage cron", () => {
  const cronReq = (auth?: string) =>
    new NextRequest("https://www.realframe.app/api/cron/bill-usage", {
      headers: auth ? { authorization: auth } : {},
    });

  beforeEach(() => vi.stubEnv("CRON_SECRET", "cron-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("refuses callers without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/bill-usage/route");
    expect((await GET(cronReq())).status).toBe(401);
    expect((await GET(cronReq("Bearer nope"))).status).toBe(401);
  });

  it("works through many accounts several at a time", async () => {
    const anchor = new Date(Date.now() - 75 * 86_400_000).toISOString();
    state.admin = fakeSupabase((c) => {
      if (c.rpc === "plan_settings")
        return { data: [{ pro_included_micros: 10_000_000 }] };
      if (c.table === "profiles")
        return {
          data: Array.from({ length: 40 }, (_, i) => ({
            id: `u${i}`,
            stripe_customer_id: `cus_${i}`,
            current_period_start: anchor,
          })),
        };
      if (c.table === "teams") return { data: [] };
      if (c.rpc) return usageRpc(c, []);
    });
    const { GET } = await import("@/app/api/cron/bill-usage/route");
    const res = await GET(cronReq("Bearer cron-secret"));
    expect(await res.json()).toMatchObject({
      accounts: 40,
      reached: 40,
      left: 0,
    });
  });

  it("invoices each finished month's overage once and stamps the builds", async () => {
    const anchor = new Date(Date.now() - 75 * 86_400_000).toISOString();
    const old = (days: number) =>
      new Date(Date.now() - days * 86_400_000).toISOString();
    state.admin = fakeSupabase((c) => {
      if (c.rpc === "plan_settings")
        return { data: [{ pro_included_micros: 10_000_000 }] };
      if (c.table === "profiles")
        return {
          data: [
            {
              id: "u1",
              stripe_customer_id: "cus_y",
              current_period_start: anchor,
            },
          ],
        };
      if (c.table === "teams") return { data: [] };
      if (c.rpc)
        return usageRpc(c, [
          { billed_micros: 9_000_000, created_at: old(70) },
          { billed_micros: 3_000_000, created_at: old(66) },
          { billed_micros: 1_000_000, created_at: old(40) },
        ]);
    });
    const { GET } = await import("@/app/api/cron/bill-usage/route");
    const res = await GET(cronReq("Bearer cron-secret"));
    expect(await res.json()).toEqual({
      accounts: 1,
      reached: 1,
      left: 0,
      invoices: 1,
      failures: [],
    });
    const [item] = state.stripe.invoiceItems.create.mock
      .calls[0] as unknown as [{ amount: number; customer: string }];
    expect(item).toMatchObject({ amount: 200, customer: "cus_y" });
    const stamps = state.admin.calls.filter((c) => c.rpc === "stamp_usage");
    expect(stamps.map((s) => (s.args as { p_stamp: string }).p_stamp)).toEqual([
      "in_usage_1",
      expect.stringMatching(/^included-cus_y-/),
    ]);
    expect(state.stripe.invoices.finalizeInvoice).toHaveBeenCalledTimes(1);
  });
});
