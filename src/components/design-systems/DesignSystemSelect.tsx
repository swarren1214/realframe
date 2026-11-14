"use client";
import { Layers, Sparkles } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DsOption = {
  id: string;
  name: string;
  colors: string[];
  isDefault: boolean;
};

export function Dots({ colors }: { colors: string[] }) {
  if (!colors.length)
    return <Layers className="size-4 text-stone-500" aria-hidden="true" />;
  return (
    <span className="inline-flex" aria-hidden="true">
      {colors.slice(0, 3).map((c, i) => (
        <span
          key={i}
          className="size-3.5 rounded-full border-[1.5px] border-card"
          style={{ background: c, marginLeft: i ? -4 : 0 }}
        />
      ))}
    </span>
  );
}

/** Design system for a new prototype (form field "design_system"). Starts on the team default. */
export function DesignSystemSelect({
  options,
  teamName,
}: {
  options: DsOption[];
  teamName: string;
}) {
  if (!options.length) return null;
  const def = options.find((o) => o.isDefault)?.id ?? "none";
  return (
    <Select name="design_system" defaultValue={def}>
      <SelectTrigger
        aria-label="Design system"
        className="h-11 w-auto gap-2 rounded-full border-transparent bg-transparent px-4 text-sm font-medium text-stone-700 shadow-none hover:border-transparent hover:bg-stone-900/[.05] data-[state=open]:bg-stone-900/[.05] max-w-60 [&>span_.ds-default]:hidden"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>{teamName}</SelectLabel>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <Dots colors={o.colors} />
              {o.name}
              {o.isDefault && (
                <span className="ds-default text-xs text-stone-500">
                  · default
                </span>
              )}
            </SelectItem>
          ))}
          <SelectItem value="none">
            <Sparkles className="size-4 text-stone-500" aria-hidden="true" />
            No design system
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
