"use client";
import {
  Monitor,
  MonitorSmartphone,
  Smartphone,
  Tablet,
  TabletSmartphone,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPTIONS = [
  { value: "any", label: "Any screen", icon: MonitorSmartphone },
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "phone", label: "Phone", icon: Smartphone },
  { value: "mobile", label: "Phone & tablet", icon: TabletSmartphone },
];

/** "Built for" on the new-prototype form: the first build designs for this screen. */
export function BuiltForSelect() {
  return (
    <Select name="built_for" defaultValue="any">
      <SelectTrigger
        aria-label="Built for"
        className="h-11 w-auto gap-2 rounded-full border-transparent bg-transparent px-4 text-sm font-medium text-stone-700 shadow-none hover:border-transparent hover:bg-stone-900/[.05] data-[state=open]:bg-stone-900/[.05]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <SelectItem key={value} value={value}>
            <Icon className="size-4 text-stone-500" aria-hidden="true" />
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
