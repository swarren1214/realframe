import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-full border border-input bg-card px-3.5 text-[13px] text-foreground shadow-xs outline-none transition-[border-color,box-shadow]",
        "placeholder:text-stone-400 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-raspberry-100",
        "aria-invalid:border-destructive aria-invalid:ring-red-100",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
