"use client";
import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { SlidingPill, useSlidingPill } from "@/components/ui/sliding-pill";

/** Segmented control: a pill track whose selected pill slides between options. */
function ToggleGroup({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  const [ref, pill] = useSlidingPill<HTMLDivElement>(
    '[data-slot="toggle-group-item"][data-state="on"]',
  );
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      data-slot="toggle-group"
      className={cn(
        "relative isolate flex w-fit items-center rounded-full bg-foreground/5 p-0.5",
        className,
      )}
      {...props}
    >
      {props.type === "single" && <SlidingPill pill={pill} />}
      {children}
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-stone-600 outline-none transition-[color,background-color,box-shadow] active:scale-[.97]",
        "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
        "data-[state=on]:text-foreground [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem };
