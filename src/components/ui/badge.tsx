import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-glow-soft text-accent-foreground shadow-[inset_0_0_0_1px_var(--color-raspberry-200)]",
        secondary: "bg-secondary text-stone-700",
        outline: "border border-border text-stone-700",
        success: "bg-emerald-50 text-emerald-800",
        warning: "bg-amber-50 text-amber-800",
        destructive: "bg-red-50 text-destructive",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

/** Small status dot for use inside a Badge. */
function BadgeDot() {
  return (
    <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
  );
}

export { Badge, BadgeDot, badgeVariants };
