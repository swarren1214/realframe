"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import type { FrameHandle, SelectedElement } from "@/components/PrototypeFrame";
import { applyEdits, describeEdits, ensureIds, px, toHex, type ElementEdit } from "@/lib/editing";

/** State for one visual-editing session over a prototype document. */
export function useVisualEditor(sourceHtml: string | null | undefined) {
  const frame = useRef<FrameHandle>(null);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [edits, setEdits] = useState<Record<string, ElementEdit>>({});
  const editableHtml = useMemo(() => (sourceHtml ? ensureIds(sourceHtml) : null), [sourceHtml]);

  const change = useCallback(
    (c: { styles?: Record<string, string>; text?: string }) => {
      if (!selected) return;
      const key = selected.rf ? `rf:${selected.rf}` : `sel:${selected.selector}`;
      frame.current?.apply({ rf: selected.rf, selector: selected.selector }, c);
      setEdits((prev) => {
        const cur = prev[key] ?? { key, rf: selected.rf, selector: selected.selector, styles: {}, label: selected.label || selected.tag };
        return {
          ...prev,
          [key]: { ...cur, styles: { ...cur.styles, ...(c.styles ?? {}) }, ...(typeof c.text === "string" ? { text: c.text } : {}) },
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
    result: () => (editableHtml && list.length ? { html: applyEdits(editableHtml, list), summary: describeEdits(list) } : null),
  };
}

const WEIGHTS = ["300", "400", "500", "600", "700", "800"];

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
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {!selected ? (
          <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-600">
            <p className="font-semibold text-stone-900">Click anything in the preview</p>
            <p className="mt-1">
              Change its text, colors, type, spacing and corners. Edits show instantly and are saved into the prototype&apos;s code as
              a new version.
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Selected</p>
              <p className="mt-0.5 truncate text-sm">
                <code className="rounded bg-stone-100 px-1 text-xs">{selected.tag}</code>{" "}
                <span className="text-stone-600">{selected.label}</span>
              </p>
              <p className="text-xs text-stone-500">
                {selected.rect.w} × {selected.rect.h}
                {!selected.rf && " · drawn by the prototype's script, so text edits aren't available"}
              </p>
            </div>

            {selected.text !== null && selected.rf && (
              <Field label="Text" htmlFor="insp-text">
                <textarea
                  id="insp-text"
                  key={`${selected.selector}-text`}
                  defaultValue={selected.text}
                  rows={3}
                  onChange={(e) => onChange({ text: e.target.value })}
                  className="w-full resize-y rounded-lg border border-stone-300 p-2 text-sm"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <ColorField id="insp-color" label="Text color" value={s.color} onChange={(v) => onChange({ styles: { color: v } })} />
              <ColorField
                id="insp-bg"
                label="Background"
                value={s.backgroundColor}
                onChange={(v) => onChange({ styles: { backgroundColor: v } })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberField selKey={selected.selector} id="insp-fs" label="Font size" value={px(s.fontSize)} onChange={(n) => onChange({ styles: { fontSize: `${n}px` } })} />
              <Field label="Weight" htmlFor="insp-fw">
                <select
                  id="insp-fw"
                  value={WEIGHTS.includes(s.fontWeight) ? s.fontWeight : "400"}
                  onChange={(e) => onChange({ styles: { fontWeight: e.target.value } })}
                  className="min-h-9 w-full rounded-lg border border-stone-300 bg-white px-2 text-sm"
                >
                  {WEIGHTS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Align" htmlFor="insp-align">
              <div id="insp-align" role="group" aria-label="Text align" className="flex gap-1">
                {["left", "center", "right"].map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={s.textAlign === a || (a === "left" && s.textAlign === "start")}
                    onClick={() => onChange({ styles: { textAlign: a } })}
                    className="min-h-8 flex-1 rounded-md border border-stone-200 text-xs capitalize aria-pressed:bg-stone-900 aria-pressed:text-white"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                selKey={selected.selector}
                id="insp-py"
                label="Padding Y"
                value={px(s.paddingTop)}
                onChange={(n) => onChange({ styles: { paddingTop: `${n}px`, paddingBottom: `${n}px` } })}
              />
              <NumberField
                selKey={selected.selector}
                id="insp-px"
                label="Padding X"
                value={px(s.paddingLeft)}
                onChange={(n) => onChange({ styles: { paddingLeft: `${n}px`, paddingRight: `${n}px` } })}
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
                onChange={(n) => onChange({ styles: { marginBottom: `${n}px` } })}
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
                onChange={(n) => onChange({ styles: { borderRadius: `${n}px` } })}
              />
            </div>

            <button
              type="button"
              onClick={() => onChange({ styles: { display: hidden ? "" : "none" } })}
              className="min-h-9 w-full rounded-lg border border-stone-200 text-sm font-medium hover:bg-stone-50"
            >
              {hidden ? "Show element" : "Hide element"}
            </button>
          </>
        )}
      </div>
      <div className="space-y-2 border-t border-stone-100 p-3">
        <button
          type="button"
          disabled={!editCount || saving}
          onClick={onSave}
          className="min-h-10 w-full rounded-lg bg-ember-700 text-sm font-semibold text-white hover:bg-ember-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : editCount ? `${saveLabel} (${editCount} change${editCount === 1 ? "" : "s"})` : "No changes yet"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onDiscard}
          className="min-h-9 w-full rounded-lg text-sm text-stone-600 hover:bg-stone-50"
        >
          {editCount ? "Discard changes" : "Done"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-stone-600">
        {label}
      </label>
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
      <div className="flex items-center rounded-lg border border-stone-300 pr-2">
        <input
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
          className="min-h-9 w-full min-w-0 rounded-lg px-2 text-sm outline-none"
        />
        <span className="text-xs text-stone-500">px</span>
      </div>
    </Field>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value?: string; onChange: (v: string) => void }) {
  const hex = toHex(value);
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2 rounded-lg border border-stone-300 p-1">
        <input
          id={id}
          type="color"
          value={hex ?? "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <span className="truncate text-xs text-stone-600">{hex ?? "none"}</span>
      </div>
    </Field>
  );
}
