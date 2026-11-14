"use client";
import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { SlidingPill, useSlidingPill } from "@/components/ui/sliding-pill";

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

/**
 * The active tab's pill slides between triggers. Tabs activate on focus, so the pill also
 * shows keyboard focus; no separate focus ring (Radix focuses by script on click, which
 * Chrome treats as keyboard focus and would ring on every click).
 */
function TabsList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const [ref, pill] = useSlidingPill<HTMLDivElement>(
    '[data-slot="tabs-trigger"][data-state="active"]',
  );
  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      className={cn(
        "relative isolate flex w-full items-center rounded-full bg-foreground/5 p-0.5",
        className,
      )}
      {...props}
    >
      <SlidingPill pill={pill} />
      {children}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-medium text-stone-600 outline-none transition-[color,background-color,box-shadow]",
        "hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        "data-[state=active]:text-foreground [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
