"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import {
  devicesFor,
  KIND_LABEL,
  KINDS,
  type Device,
  type DeviceKind,
  type DeviceSettings,
} from "@/lib/devices";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KIND_ICON } from "@/components/devices/DeviceView";
import { cn } from "@/lib/utils";

const KIND_HINT: Record<DeviceKind, string> = {
  tablet: "iPad, Android tablets, team tablets",
  phone: "iPhone, Android phones",
  desktop: "Browser windows and large displays",
};

/** Where a prototype is meant to run. Builds design for these, and reviewers can only pick them. */
export function DeviceSettingsDialog({
  open,
  onOpenChange,
  settings,
  extra = [],
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  settings: DeviceSettings;
  extra?: Device[];
  onSave: (s: DeviceSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const allowed = devicesFor(draft, extra);
  const opensOn = allowed.find((d) => d.id === draft.default)?.id ?? "auto";

  function toggle(k: DeviceKind) {
    setDraft((d) => {
      const kinds = d.kinds.includes(k)
        ? d.kinds.filter((x) => x !== k)
        : [...d.kinds, k];
      return kinds.length ? { ...d, kinds } : d;
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(settings);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Device settings</DialogTitle>
          <DialogDescription>
            Where this prototype is meant to run. New builds design for these
            screens, and reviewers can only pick them.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs font-medium text-stone-600">
            Built for
          </legend>
          {KINDS.map((k) => {
            const on = draft.kinds.includes(k);
            const Icon = KIND_ICON[k];
            const last = on && draft.kinds.length === 1;
            return (
              <button
                key={k}
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-disabled={last}
                title={
                  last
                    ? "A prototype needs at least one kind of device"
                    : undefined
                }
                onClick={() => toggle(k)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors",
                  on
                    ? "border-raspberry-200 bg-card"
                    : "border-stone-200 bg-stone-50 hover:bg-stone-100/70",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-md",
                    on
                      ? "bg-[linear-gradient(135deg,#c2410c,#be185d)] text-white"
                      : "border-[1.5px] border-stone-300 bg-card",
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </span>
                <Icon className="size-4 text-stone-500" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-[13px] font-semibold">
                    {KIND_LABEL[k]}
                  </span>
                  <span className="text-xs text-stone-500">{KIND_HINT[k]}</span>
                </span>
              </button>
            );
          })}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="opens-on">Opens on</Label>
            <Select
              value={opensOn}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, default: v === "auto" ? null : v }))
              }
            >
              <SelectTrigger id="opens-on" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">First available</SelectItem>
                {KINDS.filter((k) => draft.kinds.includes(k)).map((k) => (
                  <SelectGroup key={k}>
                    {allowed
                      .filter((d) => d.kind === k)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span id="orient-lock" className="text-sm font-medium leading-none">
              Orientation
            </span>
            <ToggleGroup
              type="single"
              aria-labelledby="orient-lock"
              className="mt-1.5"
              value={draft.orientation}
              onValueChange={(v) =>
                v &&
                setDraft((d) => ({
                  ...d,
                  orientation: v as DeviceSettings["orientation"],
                }))
              }
            >
              <ToggleGroupItem value="both">Both</ToggleGroupItem>
              <ToggleGroupItem value="portrait">Portrait</ToggleGroupItem>
              <ToggleGroupItem value="landscape">Landscape</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft);
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Check />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
