"use client";
import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** A setting that turns on or off: label (and optional description) left, switch right, whole row clickable. */
function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  loading,
  className,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      data-disabled={disabled || undefined}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-foreground/[.03]",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[disabled]:hover:bg-transparent",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{description}</span>}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} loading={loading} />
    </label>
  );
}

export { SwitchRow };
