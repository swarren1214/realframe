"use client";
import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  indeterminate = false,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  /** Work is happening but how far along isn't known. */
  indeterminate?: boolean;
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-foreground/8",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full flex-1 bg-[linear-gradient(90deg,#c2410c,#be185d)]",
          indeterminate
            ? "w-2/5 animate-progress-slide rounded-full"
            : "w-full transition-transform",
        )}
        style={
          indeterminate
            ? undefined
            : { transform: `translateX(-${100 - (value || 0)}%)` }
        }
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
