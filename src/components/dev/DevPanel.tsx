"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Columns2,
  Copy,
  FileDown,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FrameHandle } from "@/components/PrototypeFrame";
import { copyWithToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  cssFor,
  diffSource,
  rgbToHex,
  type Inspected,
  type SourceSpan,
  type Tokens,
  type TreeNode,
} from "@/lib/inspect";
import { cleanHtml } from "@/lib/export";
import { CodeView } from "./CodeView";

type Tab = "elements" | "code" | "tokens" | "diff";

/** "0.2.1" → "body > :nth-child(1) > :nth-child(3) > :nth-child(2)". */
export function selectorForPath(path: string) {
  if (!path) return "body";
  return [
    "body",
    ...path.split(".").map((i) => `:nth-child(${Number(i) + 1})`),
  ].join(" > ");
}

const label = (n: { tag: string; id: string; cls: string }) =>
  n.tag +
  (n.id ? `#${n.id}` : "") +
  (n.cls ? `.${n.cls.split(/\s+/).filter(Boolean).slice(0, 3).join(".")}` : "");

export function DevPanel(props: {
  frame: RefObject<FrameHandle | null>;
  /** The version's source, as stored. Null for imported apps. */
  source: string | null;
  spans: SourceSpan[];
  selected: Inspected | null;
  /** Bumps when the preview reloads, so the tree and tokens refresh. */
  frameKey: string;
  versions: { id: string; number: number }[];
  versionId: string;
  loadHtml: (id: string) => Promise<string>;
  onCompare: (before: string) => void;
  /** Absent on the review page, where reviewers can't export. */
  onExportPart?: (el: Inspected) => void;
}) {
  const { frame, selected } = props;
  const [tab, setTab] = useState<Tab>("elements");
  const span =
    selected?.nearestSrc != null
      ? (props.spans[selected.nearestSrc] ?? null)
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-stone-100 p-3">
        <div
          role="tablist"
          aria-label="Dev mode"
          className="flex gap-0.5 rounded-full bg-stone-100 p-[3px]"
        >
          {(
            [
              ["elements", "Elements"],
              ["code", "Code"],
              ["tokens", "Tokens"],
              ["diff", "Diff"],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 rounded-full px-2 py-1.5 text-[13px] text-stone-600 transition-colors",
                tab === id && "bg-card font-semibold text-foreground shadow-xs",
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {tab === "elements" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <ElementTree
            frame={frame}
            selected={selected}
            frameKey={props.frameKey}
          />
          <Styles
            selected={selected}
            span={span}
            onLine={() => setTab("code")}
            onExport={
              props.onExportPart
                ? () => selected && props.onExportPart?.(selected)
                : undefined
            }
            frame={frame}
          />
        </div>
      )}
      {tab === "code" &&
        (props.source === null ? (
          <p className="p-4 text-[13px] text-stone-600">
            Imported apps are built from many files, so there&apos;s no single
            source to show. Elements, Styles and Tokens still work.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-2 text-xs text-stone-600">
              <span className="font-mono text-foreground">index.html</span>
              <span>{props.source.split("\n").length} lines</span>
              {span && (
                <span className="ml-auto">
                  {selected?.src == null &&
                    "Rendered by a script · nearest source "}
                  lines {span.start}–{span.end}
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <CodeView
                doc={props.source}
                range={span ? { start: span.start, end: span.end } : null}
              />
            </div>
          </div>
        ))}
      {tab === "tokens" && (
        <TokensView frame={frame} frameKey={props.frameKey} />
      )}
      {tab === "diff" && (
        <DiffView
          versions={props.versions}
          versionId={props.versionId}
          loadHtml={props.loadHtml}
          onCompare={props.onCompare}
          available={props.source !== null}
        />
      )}
    </div>
  );
}

function ElementTree({
  frame,
  selected,
  frameKey,
}: {
  frame: RefObject<FrameHandle | null>;
  selected: Inspected | null;
  frameKey: string;
}) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    try {
      const list = (await frame.current?.tree()) ?? [];
      setNodes(list);
      // Start with the first three levels open.
      setClosed(
        new Set(
          list.filter((n) => n.depth >= 3 && n.kids > 0).map((n) => n.path),
        ),
      );
    } catch {
      setNodes([]);
    }
  }, [frame]);
  useEffect(() => {
    setNodes(null);
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [load, frameKey]);

  // Open the selected element's ancestors so it's visible in the tree.
  useEffect(() => {
    if (!selected?.path) return;
    const parts = selected.path.split(".");
    setClosed((c) => {
      const next = new Set(c);
      for (let i = 1; i < parts.length; i++)
        next.delete(parts.slice(0, i).join("."));
      return next;
    });
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-tree-path="${selected.path}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  }, [selected?.path]);

  const visible = useMemo(() => {
    if (!nodes) return [];
    const q = query.trim().toLowerCase();
    if (q)
      return nodes.filter((n) =>
        `${label(n)} ${n.text}`.toLowerCase().includes(q),
      );
    return nodes.filter((n) => {
      const parts = n.path.split(".");
      for (let i = 1; i < parts.length; i++)
        if (closed.has(parts.slice(0, i).join("."))) return false;
      return true;
    });
  }, [nodes, closed, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-b border-stone-100">
      <div className="flex items-center gap-2 px-3 py-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-stone-200 px-2.5 py-1.5 text-[13px] text-stone-600 focus-within:ring-2 focus-within:ring-raspberry-200">
          <Search className="size-3.5" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tag, class or text"
            aria-label="Search elements"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
          />
        </label>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh elements"
          title="Refresh"
          onClick={load}
        >
          <RefreshCw />
        </Button>
      </div>
      <div
        role="tree"
        aria-label="Elements"
        className="min-h-0 flex-1 overflow-auto px-2 pb-2 font-mono text-xs"
      >
        {nodes === null ? (
          <p className="px-2 py-1 font-sans text-[13px] text-stone-600">
            Reading the page…
          </p>
        ) : visible.length === 0 ? (
          <p className="px-2 py-1 font-sans text-[13px] text-stone-600">
            Nothing matches.
          </p>
        ) : (
          visible.map((n) => {
            const on = selected?.path === n.path;
            const isClosed = closed.has(n.path);
            return (
              <div
                key={n.path}
                role="treeitem"
                aria-selected={on}
                aria-expanded={n.kids ? !isClosed : undefined}
                data-tree-path={n.path}
                onMouseEnter={() => frame.current?.inspectHover(n.path)}
                onMouseLeave={() => frame.current?.inspectHover(null)}
                className={cn(
                  "flex items-center gap-1 rounded-lg py-0.5 pr-2",
                  on
                    ? "bg-raspberry-50 text-raspberry-900"
                    : "hover:bg-stone-100",
                )}
                style={{ paddingLeft: query ? 8 : 4 + n.depth * 12 }}
              >
                {!query && n.kids > 0 ? (
                  <button
                    type="button"
                    aria-label={isClosed ? "Expand" : "Collapse"}
                    onClick={() =>
                      setClosed((c) => {
                        const next = new Set(c);
                        if (next.has(n.path)) next.delete(n.path);
                        else next.add(n.path);
                        return next;
                      })
                    }
                    className="grid size-4 shrink-0 place-items-center text-stone-500"
                  >
                    {isClosed ? (
                      <ChevronRight className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )}
                  </button>
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => frame.current?.inspectSelect(n.path)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "shrink-0",
                      on ? "font-semibold" : "text-stone-800",
                    )}
                  >
                    {label(n)}
                  </span>
                  {n.text && (
                    <span className="truncate font-sans text-stone-500">
                      {n.text}
                    </span>
                  )}
                  {n.src === null && (
                    <span
                      className="ml-auto shrink-0 rounded-full bg-stone-100 px-1.5 font-sans text-[10px] text-stone-600"
                      title="Rendered by the prototype's script"
                    >
                      script
                    </span>
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const SHOW: [string, string][] = [
  ["display", "Display"],
  ["position", "Position"],
  ["fontFamily", "Font"],
  ["fontSize", "Size"],
  ["fontWeight", "Weight"],
  ["lineHeight", "Line height"],
  ["letterSpacing", "Tracking"],
  ["color", "Text"],
  ["backgroundColor", "Background"],
  ["borderColor", "Border"],
  ["borderRadius", "Radius"],
  ["boxShadow", "Shadow"],
  ["gap", "Gap"],
  ["gridTemplateColumns", "Columns"],
  ["flexDirection", "Direction"],
  ["justifyContent", "Justify"],
  ["alignItems", "Align"],
  ["opacity", "Opacity"],
];
const isColor = (k: string) => /color$/i.test(k);
const boring = (k: string, v: string) =>
  !v ||
  v === "none" ||
  v === "normal" ||
  (k === "opacity" && v === "1") ||
  (k === "backgroundColor" && v === "rgba(0, 0, 0, 0)") ||
  (k === "position" && v === "static") ||
  (k === "borderRadius" && v === "0px") ||
  ((k === "justifyContent" || k === "alignItems") && v === "normal");

function Styles({
  selected,
  span,
  onLine,
  onExport,
  frame,
}: {
  selected: Inspected | null;
  span: SourceSpan | null;
  onLine: () => void;
  onExport?: () => void;
  frame: RefObject<FrameHandle | null>;
}) {
  if (!selected)
    return (
      <div className="p-4 text-[13px] text-stone-600">
        Click anything in the preview to see its box model and styles. Hover
        another element to measure the distance; hold{" "}
        <kbd className="rounded border border-stone-300 px-1 text-[11px]">
          Alt
        </kbd>{" "}
        for the parent&apos;s edges.
      </div>
    );
  const b = selected.box;
  const side = (v: number[]) =>
    v.every((x) => x === v[0]) ? `${v[0]}` : v.join(" ");
  async function copyHtml() {
    try {
      const x = await frame.current?.extract({
        selector: selectorForPath(selected!.path),
      });
      if (x) await copyWithToast(cleanHtml(x.html), "HTML copied");
    } catch {
      /* the preview reloaded */
    }
  }
  return (
    <div className="max-h-[55%] shrink-0 space-y-3 overflow-auto p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-mono text-[13px] font-semibold text-raspberry-800">
          {label(selected)}
        </p>
        {span && (
          <button
            type="button"
            onClick={onLine}
            className="shrink-0 text-xs font-semibold text-primary"
          >
            Line {span.start} in code
          </button>
        )}
      </div>
      <div
        aria-label={`Box model: margin ${side(b.margin)}, border ${side(b.border)}, padding ${side(b.padding)}, ${selected.rect.w} by ${selected.rect.h}`}
        className="mx-auto max-w-xs rounded-lg border border-dashed border-ember-200 bg-ember-50 p-2 text-center font-mono text-[11px] text-ember-800"
      >
        margin {side(b.margin)}
        <div className="mt-1 rounded-md border border-stone-300 bg-card p-2 text-stone-700">
          border {side(b.border)}
          <div className="mt-1 rounded border border-dashed border-emerald-300 bg-emerald-50 p-2 text-emerald-800">
            padding {side(b.padding)}
            <div className="mx-auto mt-1 w-fit rounded bg-sky-100 px-2 py-1 text-sky-900">
              {selected.rect.w} × {selected.rect.h}
            </div>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
        {SHOW.filter(([k]) => !boring(k, selected.styles[k] ?? "")).map(
          ([k, name]) => {
            const v = selected.styles[k];
            return (
              <div key={k} className="contents">
                <dt className="text-stone-600">{name}</dt>
                <dd className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
                  {isColor(k) && (
                    <span
                      className="size-3.5 shrink-0 rounded border border-stone-900/10"
                      style={{ background: v }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate" title={v}>
                    {isColor(k)
                      ? rgbToHex(v)
                      : k === "fontFamily"
                        ? v.split(",")[0].replace(/["']/g, "")
                        : v}
                  </span>
                </dd>
              </div>
            );
          },
        )}
      </dl>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => copyWithToast(cssFor(selected), "CSS copied")}
        >
          <Copy />
          Copy CSS
        </Button>
        <Button size="sm" variant="outline" onClick={copyHtml}>
          <Copy />
          Copy HTML
        </Button>
        {onExport && (
          <Button size="sm" variant="secondary" onClick={onExport}>
            <FileDown />
            Export part
          </Button>
        )}
      </div>
    </div>
  );
}

const TOKEN_SECTIONS: [keyof Tokens, string][] = [
  ["colors", "Color"],
  ["fonts", "Type"],
  ["sizes", "Size / line height"],
  ["radii", "Radius"],
  ["spacing", "Spacing"],
  ["shadows", "Shadow"],
];

function TokensView({
  frame,
  frameKey,
}: {
  frame: RefObject<FrameHandle | null>;
  frameKey: string;
}) {
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [on, setOn] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    setTokens(null);
    const t = setTimeout(async () => {
      try {
        const x = await frame.current?.tokens();
        if (!gone && x) setTokens(x);
      } catch {
        /* preview reloading */
      }
    }, 300);
    return () => {
      gone = true;
      clearTimeout(t);
      frame.current?.highlight(null);
    };
  }, [frame, frameKey]);

  function pick(kind: keyof Tokens, value: string) {
    const key = `${kind}:${value}`;
    if (on === key) {
      setOn(null);
      frame.current?.highlight(null);
    } else {
      setOn(key);
      frame.current?.highlight(kind, value);
    }
  }
  function asCss() {
    if (!tokens) return "";
    const lines = [
      ...tokens.colors.map(
        (c, i) => `  --color-${i + 1}: ${rgbToHex(c.value)};`,
      ),
      ...tokens.radii.map((r, i) => `  --radius-${i + 1}: ${r.value};`),
      ...tokens.spacing
        .slice(0, 12)
        .map((s, i) => `  --space-${i + 1}: ${s.value};`),
    ];
    return `:root {\n${lines.join("\n")}\n}\n`;
  }

  if (!tokens)
    return <p className="p-4 text-[13px] text-stone-600">Reading the page…</p>;
  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
      <p className="text-xs text-stone-600">
        Every value in use, most used first. Click one to outline where
        it&apos;s used.
      </p>
      {TOKEN_SECTIONS.map(([kind, name]) =>
        tokens[kind].length ? (
          <section key={kind} className="space-y-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-stone-600">
              {name}
            </h3>
            {tokens[kind].map((t) => {
              const key = `${kind}:${t.value}`;
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={on === key}
                  onClick={() => pick(kind, t.value)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13px]",
                    on === key
                      ? "bg-violet-50 ring-1 ring-violet-300"
                      : "hover:bg-stone-100",
                  )}
                >
                  {kind === "colors" && (
                    <span
                      className="size-5 shrink-0 rounded-md border border-stone-900/10"
                      style={{ background: t.value }}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-xs"
                    title={t.value}
                  >
                    {kind === "colors" ? rgbToHex(t.value) : t.value}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-stone-500">
                    ×{t.count}
                  </span>
                </button>
              );
            })}
          </section>
        ) : null,
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => copyWithToast(asCss(), "CSS variables copied")}
        >
          <Copy />
          Copy as CSS variables
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            copyWithToast(JSON.stringify(tokens, null, 2), "JSON copied")
          }
        >
          JSON
        </Button>
      </div>
    </div>
  );
}

function DiffView({
  versions,
  versionId,
  loadHtml,
  onCompare,
  available,
}: {
  versions: { id: string; number: number }[];
  versionId: string;
  loadHtml: (id: string) => Promise<string>;
  onCompare: (before: string) => void;
  available: boolean;
}) {
  const i = versions.findIndex((v) => v.id === versionId);
  const others = versions.filter((v) => v.id !== versionId);
  const [base, setBase] = useState<string>(
    versions[i + 1]?.id ?? others[0]?.id ?? "",
  );
  const [diff, setDiff] = useState<ReturnType<typeof diffSource> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!base || !available) return;
    let gone = false;
    setDiff(null);
    setError("");
    Promise.all([loadHtml(base), loadHtml(versionId)])
      .then(
        ([a, b]) => !gone && setDiff(diffSource(cleanHtml(a), cleanHtml(b))),
      )
      .catch(() => !gone && setError("Couldn't load those versions."));
    return () => {
      gone = true;
    };
  }, [base, versionId, loadHtml, available]);

  if (!available)
    return (
      <p className="p-4 text-[13px] text-stone-600">
        Imported apps don&apos;t have a single source to compare.
      </p>
    );
  if (!others.length)
    return (
      <p className="p-4 text-[13px] text-stone-600">
        There&apos;s only one version so far.
      </p>
    );
  const me = versions[i]?.number;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-4 py-2 text-[13px]">
        <label className="flex items-center gap-1.5 text-stone-600">
          v{me} against
          <select
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="h-8 rounded-lg border border-stone-200 bg-card px-1.5 text-foreground"
          >
            {others.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.number}
              </option>
            ))}
          </select>
        </label>
        {diff && (
          <span className="font-mono text-xs">
            <span className="text-emerald-700">+{diff.added}</span>{" "}
            <span className="text-red-700">−{diff.removed}</span>
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => onCompare(base)}
        >
          <Columns2 />
          Compare visually
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-stone-950 py-2 font-mono text-[12px] leading-5 text-stone-200">
        {error ? (
          <p className="px-4 font-sans text-stone-300">{error}</p>
        ) : !diff ? (
          <p className="px-4 font-sans text-stone-400">Comparing…</p>
        ) : diff.added + diff.removed === 0 ? (
          <p className="px-4 font-sans text-stone-300">
            The source is identical.
          </p>
        ) : (
          diff.rows.map((r, k) =>
            r.kind === "fold" ? (
              <div
                key={k}
                className="my-1 bg-stone-900 px-4 py-0.5 font-sans text-[11px] text-stone-400"
              >
                {r.count} unchanged line{r.count === 1 ? "" : "s"}
              </div>
            ) : (
              <div
                key={k}
                className={cn(
                  "flex",
                  r.kind === "add" && "bg-emerald-500/15",
                  r.kind === "del" && "bg-red-500/15",
                )}
              >
                <span className="w-10 shrink-0 select-none pr-1 text-right text-stone-500">
                  {r.a ?? ""}
                </span>
                <span className="w-10 shrink-0 select-none pr-1 text-right text-stone-500">
                  {r.b ?? ""}
                </span>
                <span
                  className={cn(
                    "w-4 shrink-0 select-none text-center",
                    r.kind === "add"
                      ? "text-emerald-400"
                      : r.kind === "del"
                        ? "text-red-400"
                        : "text-stone-600",
                  )}
                  aria-hidden="true"
                >
                  {r.kind === "add" ? "+" : r.kind === "del" ? "−" : " "}
                </span>
                <span className="whitespace-pre pr-4">{r.text}</span>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
