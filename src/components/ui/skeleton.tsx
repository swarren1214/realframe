import { cn } from "@/lib/utils";

/** A placeholder block with a soft shimmer. Size it with className. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "animate-shimmer rounded-xl bg-[linear-gradient(90deg,var(--color-stone-200)_0%,var(--color-stone-100)_50%,var(--color-stone-200)_100%)] bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
