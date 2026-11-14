"use client";
import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn("grid gap-1.5", className)} {...props} />;
}

/** A radio rendered as a selectable card. Put the card's content in children. */
function RadioGroupCard({ className, children, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-card"
      className={cn(
        "group flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left outline-none transition-colors",
        "hover:border-stone-300 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
        "data-[state=checked]:border-raspberry-200 data-[state=checked]:bg-glow-soft",
        className,
      )}
      {...props}
    >
      {children}
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupCard };
