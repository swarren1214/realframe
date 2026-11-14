"use client";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  annualSavingsPercent,
  perMonthOf,
  type BillingInterval,
} from "@/lib/plans";

/**
 * Monthly / Annual switch plus the submit button for a Checkout route. Posts `interval`
 * (and any hidden fields passed as children).
 */
export function UpgradeForm({
  action,
  monthlyUsd,
  annualUsd,
  unit = "",
  button,
  tone = "light",
  children,
}: {
  action: string;
  monthlyUsd: number;
  annualUsd: number;
  /** e.g. " per builder" */
  unit?: string;
  button: (interval: BillingInterval) => ReactNode;
  /** "dark" on a brand gradient, "light" on a card. */
  tone?: "light" | "dark";
  children?: ReactNode;
}) {
  const [interval, setPeriod] = useState<BillingInterval>("year");
  const save = annualSavingsPercent(monthlyUsd, annualUsd);
  const dark = tone === "dark";
  return (
    <form action={action} method="post" className="flex flex-col gap-2">
      {children}
      <input type="hidden" name="interval" value={interval} />
      <div
        role="radiogroup"
        aria-label="Billing period"
        className={cn(
          "inline-flex self-start rounded-full p-1 text-xs font-semibold",
          dark ? "bg-white/15" : "bg-stone-100",
        )}
      >
        {(["month", "year"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={interval === v}
            onClick={() => setPeriod(v)}
            className={cn(
              "min-h-8 rounded-full px-3 transition-colors",
              interval === v
                ? dark
                  ? "bg-card text-raspberry-800"
                  : "bg-card text-stone-900 shadow-sm"
                : dark
                  ? "text-white/85 hover:text-white"
                  : "text-stone-600 hover:text-stone-900",
            )}
          >
            {v === "month" ? "Monthly" : `Annual · save ${save}%`}
          </button>
        ))}
      </div>
      <p
        className={cn("text-xs", dark ? "text-white/85" : "text-stone-600")}
        aria-live="polite"
      >
        {interval === "year"
          ? `$${annualUsd}${unit} a year, billed annually (${perMonthOf(annualUsd)} a month)`
          : `$${monthlyUsd}${unit} a month, billed monthly`}
      </p>
      {button(interval)}
    </form>
  );
}
