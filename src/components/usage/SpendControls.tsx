"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { notify } from "@/lib/toast";
import { unwrapped } from "@/lib/safe-action";
import { ALERT_CHOICES } from "@/lib/usage";
import { saveSpendControls as raw_saveSpendControls } from "@/app/(app)/billing/actions";

const saveSpendControls = unwrapped(raw_saveSpendControls);

/** Usage alerts and the monthly spend cap, for a person or (admins only) a team. */
export function SpendControls({
  teamId,
  capMicros,
  thresholds,
  includedMicros,
  canEdit,
}: {
  teamId: string | null;
  capMicros: number | null;
  thresholds: number[];
  includedMicros: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>(thresholds);
  const [capOn, setCapOn] = useState(capMicros !== null);
  const [cap, setCap] = useState(
    capMicros !== null ? (capMicros / 1_000_000).toFixed(2) : "",
  );
  const [saving, setSaving] = useState(false);
  const included = (includedMicros / 1_000_000).toFixed(0);

  async function save() {
    setSaving(true);
    try {
      await saveSpendControls(teamId, capOn ? cap : "", picked);
      notify.success("Spend controls saved");
      router.refresh();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <fieldset disabled={!canEdit} className="space-y-3">
        <legend className="text-sm font-semibold">Usage alerts</legend>
        <p className="text-[13px] text-stone-600">
          Posted to {teamId ? "admins' Inboxes" : "your Inbox"}, and emailed
          when Billing emails are on, when this period&apos;s usage reaches a
          share of the ${included} included.
        </p>
        <div className="flex flex-wrap gap-2">
          {ALERT_CHOICES.map((t) => {
            const on = picked.includes(t);
            return (
              <label
                key={t}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-raspberry-300 ${on ? "border-raspberry-200 bg-raspberry-50 text-raspberry-800" : "border-stone-200"}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-raspberry-700"
                  checked={on}
                  onChange={() =>
                    setPicked((p) =>
                      on ? p.filter((x) => x !== t) : [...p, t],
                    )
                  }
                />
                {t}%
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={!canEdit} className="space-y-3" id="spend-controls">
        <legend className="text-sm font-semibold">Monthly spend cap</legend>
        <div className="flex items-center gap-3">
          <Switch
            id="cap-on"
            checked={capOn}
            onCheckedChange={setCapOn}
            aria-describedby="cap-help"
          />
          <Label htmlFor="cap-on" className="text-sm font-normal">
            Pause new builds when this period&apos;s AI usage reaches
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-stone-600" aria-hidden="true">
            $
          </span>
          <Input
            aria-label="Spend cap in dollars"
            inputMode="decimal"
            className="w-32"
            value={cap}
            placeholder={String(Number(included) * 2 || 25)}
            disabled={!capOn || !canEdit}
            onChange={(e) => setCap(e.target.value)}
          />
        </div>
        <p id="cap-help" className="text-xs text-stone-600">
          The cap is checked when a build starts, never between the steps of a
          planned build. Failed builds don&apos;t count.
        </p>
      </fieldset>

      {canEdit ? (
        <div className="md:col-span-2">
          <Button onClick={save} loading={saving}>
            Save controls
          </Button>
        </div>
      ) : (
        <p className="text-xs text-stone-600 md:col-span-2">
          Only workspace admins can change these.
        </p>
      )}
    </div>
  );
}
