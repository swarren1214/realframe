import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium no-underline outline-none " +
    "transition-[background-color,border-color,box-shadow,filter,transform,color] duration-150 active:scale-[.97] " +
    "focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 " +
    "aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Primary action: ember → raspberry gradient with a glow. */
        default: "btn-glow",
        outline:
          "border border-border bg-card text-stone-800 shadow-xs hover:border-stone-300 hover:bg-stone-50 " +
          "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-white",
        secondary: "bg-foreground text-white hover:bg-stone-800",
        ghost: "text-stone-600 hover:bg-foreground/5 hover:text-foreground aria-pressed:bg-foreground/8 aria-pressed:text-foreground",
        soft: "bg-glow-soft text-accent-foreground shadow-[inset_0_0_0_1px_var(--color-raspberry-200)] hover:brightness-[.98]",
        destructive: "text-destructive hover:bg-red-50",
        link: "h-auto! px-0! text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-9 px-3.5 text-[13px] [&_svg:not([class*='size-'])]:size-4",
        lg: "h-11 px-5 text-sm [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-[18px]",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner in place of the leading icon and blocks clicks. */
    loading?: boolean;
  };

function Button({ className, variant, size, asChild = false, loading = false, disabled, type, children, ...props }: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props}>
        {children}
      </Slot.Root>
    );
  }
  // While loading, swap the first icon child for a spinner so the label doesn't shift.
  let content = children;
  if (loading) {
    const parts = React.Children.toArray(children);
    const iconIndex = parts.findIndex((c) => React.isValidElement(c) && typeof c.type !== "string");
    if (iconIndex >= 0) parts[iconIndex] = <Spinner key="spinner" />;
    else parts.unshift(<Spinner key="spinner" />);
    content = parts;
  }
  return (
    <button
      data-slot="button"
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </button>
  );
}

export { Button, buttonVariants };
