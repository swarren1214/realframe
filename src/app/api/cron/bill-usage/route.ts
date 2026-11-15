import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { billAnnualAccount, type Account } from "@/lib/usage-billing";

export const runtime = "nodejs";
export const maxDuration = 300;

const CONCURRENCY = 6;
/** Stop taking new accounts after this, leaving time for those in progress. */
const BUDGET_MS = 230_000;

// Vercel Cron, daily: bills each finished month of AI usage for annual Pro and Team Pro plans.
// Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const stripe = getStripe();
  const [{ data: settings }, { data: users }, { data: teams }] =
    await Promise.all([
      admin.rpc("plan_settings"),
      admin
        .from("profiles")
        .select("id, stripe_customer_id, current_period_start")
        .eq("plan", "pro")
        .eq("billing_interval", "year")
        .not("stripe_customer_id", "is", null)
        .not("current_period_start", "is", null),
      admin
        .from("teams")
        .select("id, stripe_customer_id, current_period_start, seats")
        .eq("plan", "team")
        .eq("billing_interval", "year")
        .not("stripe_customer_id", "is", null)
        .not("current_period_start", "is", null),
    ]);
  const included = Number(
    (settings as { pro_included_micros: number }[] | null)?.[0]
      ?.pro_included_micros ?? 10_000_000,
  );

  const accounts: Account[] = [
    ...(users ?? []).map((u) => ({
      kind: "user" as const,
      id: u.id as string,
      customerId: u.stripe_customer_id as string,
      anchor: u.current_period_start as string,
    })),
    ...(teams ?? []).map((t) => ({
      kind: "team" as const,
      id: t.id as string,
      customerId: t.stripe_customer_id as string,
      anchor: t.current_period_start as string,
      seats: Number(t.seats ?? 1),
    })),
  ];

  // Several accounts at a time, within the function's time. Billing is idempotent, so
  // accounts not reached today are billed on the next run.
  let invoices = 0;
  let reached = 0;
  const failures: string[] = [];
  const started = Date.now();
  const queue = [...accounts];
  const worker = async () => {
    for (
      let account = queue.shift();
      account && Date.now() - started < BUDGET_MS;
      account = queue.shift()
    ) {
      reached++;
      try {
        const done = await billAnnualAccount(admin, stripe, account, included);
        invoices += done.filter((d) => d.invoiceId).length;
      } catch (e) {
        console.error("bill-usage", account.kind, account.id, e);
        failures.push(`${account.kind}:${account.id}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return NextResponse.json(
    {
      accounts: accounts.length,
      reached,
      left: accounts.length - reached,
      invoices,
      failures,
    },
    { status: failures.length ? 500 : 200 },
  );
}
