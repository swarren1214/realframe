import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/Eyebrow";
import { getStripe } from "@/lib/stripe";
import { formatUsd } from "@/lib/billing";

type Invoice = {
  id: string;
  created: number;
  periodStart: number;
  periodEnd: number;
  totalCents: number;
  status: string | null;
  lines: string;
  pdf: string | null;
  url: string | null;
};

/** The customer's recent Stripe invoices, newest first. Empty when Stripe can't be reached. */
export async function loadInvoices(customerId: string | null | undefined) {
  if (!customerId) return [] as Invoice[];
  try {
    const list = await getStripe().invoices.list({
      customer: customerId,
      limit: 12,
    });
    return list.data
      .filter((i) => i.status !== "draft")
      .map((i): Invoice => ({
        id: i.id ?? "",
        created: i.created,
        periodStart: i.period_start,
        periodEnd: i.period_end,
        totalCents: i.total,
        status: i.status ?? null,
        lines: i.lines.data
          .slice(0, 3)
          .map((l) => l.description ?? "")
          .filter(Boolean)
          .join(" · "),
        pdf: i.invoice_pdf ?? null,
        url: i.hosted_invoice_url ?? null,
      }));
  } catch (e) {
    console.error("invoices", e);
    return [] as Invoice[];
  }
}

const fmt = (s: number) =>
  new Date(s * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const STATUS: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-800",
  open: "bg-amber-50 text-amber-900",
  uncollectible: "bg-red-50 text-red-800",
  void: "bg-stone-100 text-stone-700",
};

export function Invoices({ invoices }: { invoices: Invoice[] }) {
  return (
    <Card>
      <Eyebrow>Invoices</Eyebrow>
      {invoices.length === 0 ? (
        <p className="text-[13px] text-stone-600">
          No invoices yet. They appear here after your first payment.
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-stone-100 text-xs text-stone-600">
                <th className="p-2 font-medium">Date</th>
                <th className="p-2 font-medium">What</th>
                <th className="p-2 text-right font-medium">Amount</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2">
                  <span className="sr-only">Download</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-stone-50">
                  <td className="whitespace-nowrap p-2">{fmt(i.created)}</td>
                  <td className="p-2 text-stone-700">
                    {i.lines || "Realframe"}
                  </td>
                  <td className="p-2 text-right font-semibold tabular-nums">
                    {formatUsd(i.totalCents * 10_000)}
                  </td>
                  <td className="p-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS[i.status ?? ""] ?? "bg-stone-100 text-stone-700"}`}
                    >
                      {i.status ?? "—"}
                    </span>
                  </td>
                  <td className="p-2 text-right">
                    {(i.pdf || i.url) && (
                      <a
                        href={(i.pdf || i.url)!}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold"
                      >
                        <FileText className="size-3.5" aria-hidden="true" />
                        {i.pdf ? "PDF" : "View"}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
