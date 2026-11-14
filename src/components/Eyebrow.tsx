import { cn } from "@/lib/utils";

/** Small uppercase section label. */
export function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", className)} {...props} />;
}
