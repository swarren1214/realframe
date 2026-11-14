"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentSpec, DesignSystem } from "@/lib/design-systems/types";

function fontLinks(ds: DesignSystem) {
  return (ds.tokens.fonts ?? [])
    .map((f) => f.source ?? "")
    .filter((s) => /^https:\/\/fonts\.googleapis\.com\/css2?\?/.test(s))
    .slice(0, 3)
    .map((s) => `<link rel="stylesheet" href="${s.replace(/"/g, "")}">`)
    .join("");
}

/** A small, sandboxed page that renders one component example. */
function previewDoc(ds: DesignSystem, c: ComponentSpec) {
  const font = ds.tokens.fonts?.[0]?.family;
  const base = `<!doctype html><html><head><meta charset="utf-8">${fontLinks(ds)}<style>html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;overflow:hidden;font-family:${font ? `'${font.replace(/'/g, "")}',` : ""}system-ui,sans-serif}#root{max-width:100%}</style>`;
  const example = c.example ?? "";
  if (ds.kind === "components" && ds.runtime) {
    const names = [
      ...new Set(
        [...example.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]),
      ),
    ];
    const code = `import * as DS from ${JSON.stringify(ds.runtime.package)};
import React from "react";
import { createRoot } from "react-dom/client";
const { ${names.join(", ")} } = DS;
function Demo() { return (<>${example}</>); }
class Boundary extends React.Component { constructor(p){super(p);this.state={e:false}} static getDerivedStateFromError(){return {e:true}} render(){return this.state.e?React.createElement("span",{style:{font:"12px system-ui",color:"#78716c"}},"Preview unavailable"):this.props.children} }
createRoot(document.getElementById("root")).render(<Boundary><Demo /></Boundary>);`;
    return `${base}<script type="importmap">${JSON.stringify({ imports: ds.runtime.importMap })}</script>${
      ds.runtime.stylesheet
        ? `<link rel="stylesheet" href="${ds.runtime.stylesheet}">`
        : ""
    }<script src="https://cdn.tailwindcss.com"></script><script src="https://unpkg.com/@babel/standalone@7/babel.min.js"></script></head><body><div id="root"></div><script type="text/babel" data-type="module" data-presets="react">${code.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  }
  return `${base}<script src="https://cdn.tailwindcss.com"></script></head><body><div id="root">${example}</div></body></html>`;
}

/** Renders a component's example only once it scrolls into view. */
export function ComponentPreview({
  ds,
  component,
}: {
  ds: DesignSystem;
  component: ComponentSpec;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const doc = useMemo(
    () => (seen && component.example ? previewDoc(ds, component) : ""),
    [seen, ds, component],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setSeen(true),
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="h-24 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50"
    >
      {component.example ? (
        doc && (
          <iframe
            title={`${component.name} preview`}
            srcDoc={doc}
            sandbox="allow-scripts"
            className="pointer-events-none h-full w-full border-0"
            loading="lazy"
          />
        )
      ) : (
        <div className="grid h-full place-items-center text-xs text-stone-500">
          No example
        </div>
      )}
    </div>
  );
}
