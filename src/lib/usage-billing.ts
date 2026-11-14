import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { USAGE_PRODUCT_ID } from "@/lib/stripe";
import {
  microsToCents,
  overageMicros,
  usageWindow,
  type Window,
} from "@/lib/usage-window";

// Monthly usage billing for annual plans. Monthly plans bill usage on their renewal invoice
// (see the Stripe webhook); annual plans renew once a year, so a daily cron bills each month
// that has ended on its own small invoice.

export type UsageRow = {
  id: string;
  billed_micros: number | null;
  created_at: string;
};

export type WindowBill = {
  window: Window;
  rowIds: string[];
  billedMicros: number;
  overageMicros: number;
};

/**
 * Groups unbilled builds into the monthly windows they fall in (counted from `anchor`) and
 * works out each finished window's overage. Windows that haven't ended yet are left alone.
 */
export function planUsageBills(
  rows: UsageRow[],
  anchor: Date,
  now: Date,
  includedMicros: number,
): WindowBill[] {
  const byWindow = new Map<number, WindowBill>();
  for (const r of rows) {
    const w = usageWindow(anchor, new Date(r.created_at));
    if (w.end > now) continue;
    const key = w.start.getTime();
    const bill = byWindow.get(key) ?? {
      window: w,
      rowIds: [],
      billedMicros: 0,
      overageMicros: 0,
    };
    bill.rowIds.push(r.id);
    bill.billedMicros += Number(r.billed_micros ?? 0);
    byWindow.set(key, bill);
  }
  return [...byWindow.values()]
    .map((b) => ({
      ...b,
      overageMicros: overageMicros(b.billedMicros, includedMicros),
    }))
    .sort((a, b) => a.window.start.getTime() - b.window.start.getTime());
}

const fmt = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export type Account =
  | { kind: "user"; id: string; customerId: string; anchor: string }
  | {
      kind: "team";
      id: string;
      customerId: string;
      anchor: string;
      seats: number;
    };

/** Bills every finished, unbilled month for one annual account. Returns what it billed. */
export async function billAnnualAccount(
  admin: SupabaseClient,
  stripe: Stripe,
  account: Account,
  includedPerSeatMicros: number,
  now = new Date(),
) {
  const anchor = new Date(account.anchor);
  const included =
    account.kind === "team"
      ? includedPerSeatMicros * Math.max(1, account.seats)
      : includedPerSeatMicros;
  // Only builds from before the current window can be in a finished window.
  const current = usageWindow(anchor, now);
  let q = admin
    .from("generations")
    .select("id, billed_micros, created_at")
    .is("billed_invoice_id", null)
    .lt("created_at", current.start.toISOString())
    .gte(
      "created_at",
      new Date(now.getTime() - 400 * 86_400_000).toISOString(),
    );
  q =
    account.kind === "team"
      ? q.eq("team_id", account.id)
      : q.eq("user_id", account.id).is("team_id", null);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const bills = planUsageBills(
    (rows ?? []) as UsageRow[],
    anchor,
    now,
    included,
  );
  const done: { window: Window; cents: number; invoiceId: string | null }[] =
    [];
  for (const bill of bills) {
    let stamp = `included-${account.customerId}-${bill.window.start.toISOString()}`;
    let cents = 0;
    let invoiceId: string | null = null;
    if (bill.overageMicros > 0) {
      cents = microsToCents(bill.overageMicros);
      const key = `usage-${account.customerId}-${bill.window.start.toISOString()}`;
      const invoice = await stripe.invoices.create(
        {
          customer: account.customerId,
          auto_advance: true,
          collection_method: "charge_automatically",
          pending_invoice_items_behavior: "exclude",
          description: "Realframe AI usage",
          metadata: { app: "realframe", kind: "usage_overage_monthly" },
        },
        { idempotencyKey: `${key}-invoice` },
      );
      await stripe.invoiceItems.create(
        {
          customer: account.customerId,
          invoice: invoice.id,
          currency: "usd",
          amount: cents,
          description: `AI usage beyond $${(included / 1_000_000).toFixed(0)} included (${fmt(bill.window.start)} – ${fmt(bill.window.end)})`,
          metadata: {
            app: "realframe",
            kind: "usage_overage",
            product: USAGE_PRODUCT_ID,
            builds: String(bill.rowIds.length),
          },
        },
        { idempotencyKey: `${key}-item` },
      );
      invoiceId = invoice.id!;
      stamp = invoice.id!;
    }
    const { error: upd } = await admin
      .from("generations")
      .update({ billed_invoice_id: stamp })
      .in("id", bill.rowIds);
    if (upd) throw new Error(upd.message);
    done.push({ window: bill.window, cents, invoiceId });
  }
  return done;
}
