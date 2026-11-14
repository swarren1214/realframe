"use client";
import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * iOS-proportioned switch in Realframe colours. `loading` shows a spinner in the thumb and
 * ignores clicks while a change saves.
 */
function Switch({
  className,
  size = "default",
  loading = false,
  disabled,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & { size?: "sm" | "default"; loading?: boolean }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none",
        "transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        "data-[size=default]:h-6 data-[size=default]:w-10 data-[size=sm]:h-[18px] data-[size=sm]:w-8",
        "data-[state=unchecked]:bg-stone-200 data-[state=unchecked]:shadow-[inset_0_0_0_1px_rgb(28_25_23/0.08)]",
        "data-[state=checked]:bg-raspberry-600 data-[state=checked]:shadow-[0_4px_12px_-4px_rgb(219_39_119/0.6)]",
        "focus-visible:ring-[3px] focus-visible:ring-raspberry-600/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none grid place-items-center rounded-full bg-white shadow-[0_1px_3px_rgb(28_25_23/0.25),0_1px_1px_rgb(28_25_23/0.08)]",
          "transition-[transform,width] duration-[180ms] ease-[var(--ease-out)]",
          "group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-3.5",
          // Slide across; stretch a little while pressed.
          "data-[state=unchecked]:translate-x-0",
          "group-data-[size=default]/switch:data-[state=checked]:translate-x-4 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3.5",
          "group-active/switch:group-data-[size=default]/switch:w-6 group-active/switch:group-data-[size=default]/switch:data-[state=checked]:translate-x-3",
        )}
      >
        {loading && <LoaderCircle className="size-3 animate-spin text-raspberry-600" aria-hidden="true" />}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  );
}

export { Switch };
