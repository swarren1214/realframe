"use client";
import { useEffect, useRef } from "react";
import {
  EditorState,
  StateEffect,
  StateField,
  RangeSetBuilder,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  highlightActiveLineGutter,
  lineNumbers,
  type DecorationSet,
} from "@codemirror/view";
import { html as htmlLang } from "@codemirror/lang-html";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** Lines to mark, 1-based and inclusive. */
type Range = { start: number; end: number } | null;
const setRange = StateEffect.define<Range>();

const rangeField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setRange)) continue;
      if (!e.value) return Decoration.none;
      const b = new RangeSetBuilder<Decoration>();
      const doc = tr.state.doc;
      const last = Math.min(e.value.end, doc.lines);
      for (let n = Math.max(1, e.value.start); n <= last; n++)
        b.add(
          doc.line(n).from,
          doc.line(n).from,
          Decoration.line({ class: "cm-rf-selected" }),
        );
      return b.finish();
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

// Colors follow the app's palette and stay legible on the dark code surface.
const highlight = HighlightStyle.define([
  { tag: [t.tagName, t.angleBracket], color: "#f472b6" },
  { tag: t.attributeName, color: "#fdba74" },
  { tag: t.attributeValue, color: "#86efac" },
  { tag: [t.string, t.special(t.string)], color: "#86efac" },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "#c4b5fd" },
  { tag: [t.number, t.bool, t.null], color: "#fcd34d" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "#7dd3fc" },
  { tag: t.comment, color: "#a8a29e", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.className], color: "#93c5fd" },
]);

const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "12.5px",
      backgroundColor: "#1c1917",
      color: "#e7e5e4",
    },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      lineHeight: "1.65",
    },
    ".cm-gutters": {
      backgroundColor: "#1c1917",
      color: "#78716c",
      border: "none",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#d6d3d1",
    },
    ".cm-rf-selected": {
      backgroundColor: "rgba(219,39,119,.16)",
      boxShadow: "inset 3px 0 0 #f472b6",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-content": { caretColor: "transparent" },
  },
  { dark: true },
);

/** Read-only source with line numbers and a marked range, scrolled into view when it changes. */
export function CodeView({ doc, range }: { doc: string; range: Range }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          htmlLang(),
          syntaxHighlighting(highlight),
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({
            "aria-label": "Prototype source",
            tabindex: "0",
          }),
          rangeField,
          theme,
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [doc]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const effects: StateEffect<unknown>[] = [setRange.of(range)];
    if (range && range.start <= v.state.doc.lines)
      effects.push(
        EditorView.scrollIntoView(v.state.doc.line(range.start).from, {
          y: "center",
        }),
      );
    v.dispatch({ effects });
  }, [range, doc]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
