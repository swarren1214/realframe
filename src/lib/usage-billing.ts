import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { USAGE_PRODUCT_ID } from "@/lib/stripe";
import {
  windowsToBill,
  microsToCents,
  overageMicros,
  type Window,
} from "@/lib/usage-window";

// Monthly usage billing for annual plans. Monthly plans bill usage on their renewal invoice
// (see the Stripe webhook); annual plans renew once a year, so a daily cron bills each month
// that has ended on its own small invoice.

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

type BillAccount = {
  kind: "user" | "team";
  id: string;
  customerId: string;
};

/** The renewal invoice a monthly plan's overage goes on (the Stripe webhook's case). */
type Renewal = { id: string; currency: string | null };

export type WindowResult = {
  window: Window;
  builds: number;
  billedMicros: number;
  cents: number;
  invoiceId: string | null;
};

const usageKey = (customerId: string, w: Window) =>
  `usage-${customerId}-${w.start.toISOString()}`;

/**
 * Bills one usage window for one account, at most once ever.
 *
 * Totals and the "billed" stamp are worked out in the database, so there's no row limit and no
 * list of ids in a URL. A ledger row per account and window (usage_bills) remembers the invoice,
 * and a rerun finds an invoice an earlier, interrupted run made (by its metadata) instead of
 * making another. Annual plans get their own small invoice; monthly plans get a line on their
 * renewal invoice, added only if it isn't there already.
 */
export async function billUsageWindow(
  admin: SupabaseClient,
  stripe: Stripe,
  account: BillAccount,
  window: Window,
  includedMicros: number,
  renewal?: Renewal,
): Promise<WindowResult> {
  const p_user = account.kind === "user" ? account.id : null;
  const p_team = account.kind === "team" ? account.id : null;
  const range = {
    p_user,
    p_team,
    p_from: window.start.toISOString(),
    p_to: window.end.toISOString(),
  };
  const { data: totals, error: totalsError } = await admin.rpc(
    "unbilled_usage",
    range,
  );
  if (totalsError) throw new Error(totalsError.message);
  const row = (
    totals as { billed_micros: number; builds: number }[] | null
  )?.[0];
  const builds = Number(row?.builds ?? 0);
  const billedMicros = Number(row?.billed_micros ?? 0);
  const result: WindowResult = {
    window,
    builds,
    billedMicros,
    cents: 0,
    invoiceId: null,
  };
  if (!builds) return result;

  const { data: ledger, error: ledgerError } = await admin.rpc(
    "claim_usage_bill",
    {
      p_kind: account.kind,
      p_account: account.id,
      p_start: range.p_from,
      p_end: range.p_to,
    },
  );
  if (ledgerError || !ledger)
    throw new Error(ledgerError?.message ?? "Couldn't open the usage ledger.");
  const bill = ledger as { id: string; invoice_id: string | null };

  const overage = overageMicros(billedMicros, includedMicros);
  const cents = overage > 0 ? microsToCents(overage) : 0;
  let stamp = bill.invoice_id;
  if (!stamp) {
    if (cents > 0) {
      const key = usageKey(account.customerId, window);
      const invoiceId = renewal
        ? await addRenewalLine(
            stripe,
            account,
            window,
            includedMicros,
            renewal,
            {
              key,
              cents,
              builds,
            },
          )
        : await annualInvoice(stripe, account, window, includedMicros, {
            key,
            cents,
            builds,
          });
      stamp = invoiceId;
      result.cents = cents;
      result.invoiceId = invoiceId;
    } else {
      stamp = `included-${account.customerId}-${range.p_from}`;
    }
    const { error } = await admin
      .from("usage_bills")
      .update({
        invoice_id: stamp,
        billed_micros: billedMicros,
        overage_micros: overage,
        builds,
      })
      .eq("id", bill.id);
    if (error) throw new Error(error.message);
  } else if (renewal && stamp === renewal.id) {
    // A retried webhook: make sure the line made it onto the invoice.
    await addRenewalLine(stripe, account, window, includedMicros, renewal, {
      key: usageKey(account.customerId, window),
      cents,
      builds,
    });
  }

  const { error: stampError } = await admin.rpc("stamp_usage", {
    ...range,
    p_stamp: stamp,
  });
  if (stampError) throw new Error(stampError.message);
  await admin
    .from("usage_bills")
    .update({ settled_at: new Date().toISOString() })
    .eq("id", bill.id);
  return result;
}

function overageLine(
  account: BillAccount,
  window: Window,
  includedMicros: number,
  bill: { key: string; cents: number; builds: number },
) {
  return {
    customer: account.customerId,
    amount: bill.cents,
    description: `AI usage beyond $${(includedMicros / 1_000_000).toFixed(0)} included (${fmt(window.start)} – ${fmt(window.end)})`,
    metadata: {
      app: "realframe",
      kind: "usage_overage",
      product: USAGE_PRODUCT_ID,
      builds: String(bill.builds),
      usage_key: bill.key,
    },
  };
}

/** Adds the overage line to a monthly plan's renewal invoice, unless it's already on it. */
async function addRenewalLine(
  stripe: Stripe,
  account: BillAccount,
  window: Window,
  includedMicros: number,
  renewal: Renewal,
  bill: { key: string; cents: number; builds: number },
) {
  if (bill.cents <= 0) return renewal.id;
  const lines = await stripe.invoices.listLineItems(renewal.id, { limit: 100 });
  if (lines.data.some((l) => l.metadata?.usage_key === bill.key))
    return renewal.id;
  await stripe.invoiceItems.create(
    {
      ...overageLine(account, window, includedMicros, bill),
      invoice: renewal.id,
      currency: renewal.currency || "usd",
    },
    { idempotencyKey: `overage-${renewal.id}` },
  );
  return renewal.id;
}

/**
 * An annual plan's monthly usage invoice. Made as a draft, given its line, then finalized, so a
 * run that stops part-way can pick the same draft up again (found by its metadata).
 */
async function annualInvoice(
  stripe: Stripe,
  account: BillAccount,
  window: Window,
  includedMicros: number,
  bill: { key: string; cents: number; builds: number },
) {
  const found = await stripe.invoices.search({
    query: `customer:"${account.customerId}" AND metadata["usage_key"]:"${bill.key}"`,
    limit: 1,
  });
  let invoice: Stripe.Invoice | undefined = found.data[0];
  if (!invoice)
    invoice = await stripe.invoices.create(
      {
        customer: account.customerId,
        auto_advance: false,
        collection_method: "charge_automatically",
        pending_invoice_items_behavior: "exclude",
        description: "Realframe AI usage",
        metadata: {
          app: "realframe",
          kind: "usage_overage_monthly",
          usage_key: bill.key,
        },
      },
      { idempotencyKey: `${bill.key}-invoice` },
    );
  if (invoice.status === "draft") {
    const lines = await stripe.invoices.listLineItems(invoice.id!, {
      limit: 100,
    });
    if (!lines.data.some((l) => l.metadata?.usage_key === bill.key))
      await stripe.invoiceItems.create(
        {
          ...overageLine(account, window, includedMicros, bill),
          invoice: invoice.id,
          currency: "usd",
        },
        { idempotencyKey: `${bill.key}-item` },
      );
    await stripe.invoices.finalizeInvoice(invoice.id!, { auto_advance: true });
  }
  return invoice.id!;
}

/** Bills every finished month (about 13 back) for one annual account. Returns what it billed. */
export async function billAnnualAccount(
  admin: SupabaseClient,
  stripe: Stripe,
  account: Account,
  includedPerSeatMicros: number,
  now = new Date(),
) {
  const included =
    account.kind === "team"
      ? includedPerSeatMicros * Math.max(1, account.seats)
      : includedPerSeatMicros;
  const done: WindowResult[] = [];
  for (const window of windowsToBill(new Date(account.anchor), now)) {
    const r = await billUsageWindow(admin, stripe, account, window, included);
    if (r.builds) done.push(r);
  }
  return done;
}
