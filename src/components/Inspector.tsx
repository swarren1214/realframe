"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import type { FrameHandle, SelectedElement } from "@/components/PrototypeFrame";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Eye,
  EyeOff,
  MousePointerClick,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Eyebrow } from "@/components/Eyebrow";
import {
  applyEdits,
  describeEdits,
  ensureIds,
  px,
  toHex,
  type ElementEdit,
} from "@/lib/editing";

/** State for one visual-editing session over a prototype document. */
export function useVisualEditor(sourceHtml: string | null | undefined) {
  const frame = useRef<FrameHandle>(null);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [edits, setEdits] = useState<Record<string, ElementEdit>>({});
  const editableHtml = useMemo(
    () => (sourceHtml ? ensureIds(sourceHtml) : null),
    [sourceHtml],
  );

  const change = useCallback(
    (c: { styles?: Record<string, string>; text?: string }) => {
      if (!selected) return;
      const key = selected.rf
        ? `rf:${selected.rf}`
        : `sel:${selected.selector}`;
      frame.current?.apply({ rf: selected.rf, selector: selected.selector }, c);
      setEdits((prev) => {
        const cur = prev[key] ?? {
          key,
          rf: selected.rf,
          selector: selected.selector,
          styles: {},
          label: selected.label || selected.tag,
        };
        return {
          ...prev,
          [key]: {
            ...cur,
            styles: { ...cur.styles, ...(c.styles ?? {}) },
            ...(typeof c.text === "string" ? { text: c.text } : {}),
          },
        };
      });
    },
    [selected],
  );

  const list = Object.values(edits);
  return {
    frame,
    selected,
    setSelected,
    editableHtml,
    edits: list,
    change,
    reset: () => {
      setEdits({});
      setSelected(null);
    },
    /** The full updated document and a version summary. */
    result: () =>
      editableHtml && list.length
        ? { html: applyEdits(editableHtml, list), summary: describeEdits(list) }
        : null,
  };
}

const WEIGHTS = ["300", "400", "500", "600", "700", "800"];
const ALIGNS = [
  { value: "left", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "right", icon: AlignRight },
] as const;

export function Inspector({
  selected,
  editCount,
  onChange,
  onSave,
  onDiscard,
  saving,
  saveLabel,
}: {
  selected: SelectedElement | null;
  editCount: number;
  onChange: (c: { styles?: Record<string, string>; text?: string }) => void;
  onSave: () => void;
  onDiscard: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  const s = selected?.styles ?? {};
  const hidden = s.display === "none";
  const align =
    s.textAlign === "start"
      ? "left"
      : s.textAlign === "end"
        ? "right"
        : s.textAlign;
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {!selected ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-glow-soft p-5 text-center">
            <span
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-2xl bg-card text-raspberry-700 shadow-xs"
            >
              <MousePointerClick className="size-5" />
            </span>
            <p className="text-[13px] font-semibold">
              Click anything in the preview
            </p>
            <p className="text-xs text-stone-600">
              Change its text, colors, type, spacing and corners. Edits show
              instantly and save into the prototype&apos;s code as a new
              version.
            </p>
          </div>
        ) : (
          <>
            <div>
              <Eyebrow>Selected</Eyebrow>
              <p className="mt-1 truncate text-[13px]">
                <code className="rounded-md bg-secondary px-1 text-[11px]">
                  {selected.tag}
                </code>{" "}
                <span className="text-stone-600">{selected.label}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {selected.rect.w} × {selected.rect.h}
                {!selected.rf &&
                  " · drawn by the prototype's script, so text edits aren't available"}
              </p>
            </div>

            {selected.text !== null && selected.rf && (
              <Field label="Text" htmlFor="insp-text">
                <Textarea
                  id="insp-text"
                  key={`${selected.selector}-text`}
                  defaultValue={selected.text}
                  rows={3}
                  onChange={(e) => onChange({ text: e.target.value })}
                  className="field-sizing-fixed resize-y"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <ColorField
                id="insp-color"
                label="Text color"
                value={s.color}
                onChange={(v) => onChange({ styles: { color: v } })}
              />
              <ColorField
                id="insp-bg"
                label="Background"
                value={s.backgroundColor}
                onChange={(v) => onChange({ styles: { backgroundColor: v } })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                selKey={selected.selector}
                id="insp-fs"
                label="Font size"
                value={px(s.fontSize)}
                onChange={(n) => onChange({ styles: { fontSize: `${n}px` } })}
              />
              <Field label="Weight" htmlFor="insp-fw">
                <Select
                  value={WEIGHTS.includes(s.fontWeight) ? s.fontWeight : "400"}
                  onValueChange={(v) => onChange({ styles: { fontWeight: v } })}
                >
                  <SelectTrigger id="insp-fw" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEIGHTS.map((w) => (
                      <SelectItem key={w} value={w}>
                        {w}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div>
              <Label className="mb-1.5">Align</Label>
              <ToggleGroup
                type="single"
                aria-label="Text align"
                value={align ?? ""}
                onValueChange={(v) =>
                  v && onChange({ styles: { textAlign: v } })
                }
                className="w-full"
              >
                {ALIGNS.map(({ value, icon: Icon }) => (
                  <ToggleGroupItem
                    key={value}
                    value={value}
                    aria-label={`Align ${value}`}
                    title={`Align ${value}`}
                    className="flex-1"
                  >
                    <Icon />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                selKey={selected.selector}
                id="insp-py"
                label="Padding Y"
                value={px(s.paddingTop)}
                onChange={(n) =>
                  onChange({
                    styles: { paddingTop: `${n}px`, paddingBottom: `${n}px` },
                  })
                }
              />
              <NumberField
                selKey={selected.selector}
                id="insp-px"
                label="Padding X"
                value={px(s.paddingLeft)}
                onChange={(n) =>
                  onChange({
                    styles: { paddingLeft: `${n}px`, paddingRight: `${n}px` },
                  })
                }
              />
              <NumberField
                selKey={selected.selector}
                id="insp-mt"
                label="Space above"
                value={px(s.marginTop)}
                onChange={(n) => onChange({ styles: { marginTop: `${n}px` } })}
              />
              <NumberField
                selKey={selected.selector}
                id="insp-mb"
                label="Space below"
                value={px(s.marginBottom)}
                onChange={(n) =>
                  onChange({ styles: { marginBottom: `${n}px` } })
                }
              />
              <NumberField
                selKey={selected.selector}
                id="insp-gap"
                label="Gap"
                value={px(s.gap)}
                onChange={(n) => onChange({ styles: { gap: `${n}px` } })}
              />
              <NumberField
                selKey={selected.selector}
                id="insp-radius"
                label="Corner radius"
                value={px(s.borderRadius)}
                onChange={(n) =>
                  onChange({ styles: { borderRadius: `${n}px` } })
                }
              />
            </div>

            <Button
              className="w-full"
              aria-pressed={hidden}
              onClick={() =>
                onChange({ styles: { display: hidden ? "" : "none" } })
              }
            >
              {hidden ? <Eye /> : <EyeOff />}
              {hidden ? "Show element" : "Hide element"}
            </Button>
          </>
        )}
      </div>
      <div className="space-y-1.5 border-t border-stone-100 p-3">
        <Button
          variant="default"
          className="w-full"
          disabled={!editCount}
          loading={saving}
          onClick={onSave}
        >
          <Save />
          {editCount
            ? `${saveLabel} (${editCount} change${editCount === 1 ? "" : "s"})`
            : "No changes yet"}
        </Button>
        <Button
          variant="ghost"
          className="w-full"
          disabled={saving}
          onClick={onDiscard}
        >
          {editCount ? "Discard changes" : "Done"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-1.5">
        {label}
      </Label>
      {children}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  selKey,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  selKey: string;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <div className="relative">
        <Input
          id={id}
          key={`${id}-${selKey}`}
          type="number"
          min={0}
          max={400}
          defaultValue={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0) onChange(n);
          }}
          className="pr-8 tabular-nums"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
          px
        </span>
      </div>
    </Field>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value?: string;
  onChange: (v: string) => void;
}) {
  const hex = toHex(value);
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex h-9 items-center gap-2 rounded-full border border-input bg-card pl-1 pr-3 shadow-xs focus-within:border-ring focus-within:ring-4 focus-within:ring-raspberry-100">
        <input
          id={id}
          type="color"
          value={hex ?? "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-stone-200 [&::-webkit-color-swatch-wrapper]:p-0.5"
        />
        <span className="truncate font-mono text-[11px] text-stone-600">
          {hex ?? "none"}
        </span>
      </div>
    </Field>
  );
}
