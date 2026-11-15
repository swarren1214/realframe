import Link from "next/link";
import { cn } from "@/lib/utils";

export type BillingTab = "usage" | "billing";

export function readBillingTab(v: unknown): BillingTab {
  return v === "billing" ? "billing" : "usage";
}

/** The Usage / Billing switch at the top of the billing pages. Plain links: no client JS. */
export function BillingTabs({
  tab,
  basePath,
}: {
  tab: BillingTab;
  basePath: string;
}) {
  return (
    <nav
      aria-label="Usage and billing"
      className="inline-flex gap-0.5 rounded-full bg-stone-100 p-[3px]"
    >
      {(
        [
          ["usage", "Usage"],
          ["billing", "Billing"],
        ] as const
      ).map(([id, label]) => (
        <Link
          key={id}
          href={`${basePath}?tab=${id}`}
          aria-current={tab === id ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-1.5 text-[13px] text-stone-600 no-underline transition-colors hover:text-foreground",
            tab === id && "bg-card font-semibold text-foreground shadow-xs",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
