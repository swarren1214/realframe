import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-2xl border border-input bg-card px-3.5 py-2.5 text-[13px] leading-relaxed shadow-xs outline-none transition-[border-color,box-shadow]",
        "placeholder:text-stone-400 hover:border-stone-300 disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-raspberry-100",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
