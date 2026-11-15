"use client";
import { useEffect, useMemo, useState } from "react";
import { strToU8, zipSync } from "fflate";
import {
  Copy,
  Download,
  FileCode2,
  FolderClosed,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Extracted } from "@/components/PrototypeFrame";
import { formatUsd } from "@/lib/billing";
import { pointedName } from "@/lib/pointing";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  AI_FORMATS,
  EXPORT_FORMATS,
  FORMAT_INFO,
  estimateMicros,
  partFiles,
  slugify,
  splitHtml,
  cleanHtml,
  type ExportFile,
  type ExportFormat,
  type ExportScope,
} from "@/lib/export";

export type ExportTarget = {
  rf: string | null;
  selector: string;
  label: string;
  tag: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  version: { id: string; number: number; kind: "html" | "bundle" };
  /** The version's HTML (single-file prototypes). */
  loadHtml: () => Promise<string>;
  /** Elements pointed at with Select, in the preview of this version. */
  targets: ExportTarget[];
  /** Reads an element's full markup and CSS from the preview. */
  extract: ((t: ExportTarget) => Promise<Extracted>) | null;
};

/** Whole prototype or the pointed-at part, as files or as AI-written components. */
export function ExportDialog(props: Props) {
  const { open, version, targets } = props;
  const bundle = version.kind === "bundle";
  const canSelect = !bundle && targets.length > 0 && !!props.extract;
  const [scope, setScope] = useState<ExportScope>(
    canSelect ? "selection" : "prototype",
  );
  const formats = useMemo(
    () =>
      EXPORT_FORMATS.filter(
        (f) =>
          FORMAT_INFO[f].scope === scope &&
          (bundle ? f === "bundle" : f !== "bundle"),
      ),
    [scope, bundle],
  );
  const [format, setFormat] = useState<ExportFormat>(formats[0]);
  const [files, setFiles] = useState<ExportFile[] | null>(null);
  const [active, setActive] = useState(0);
  const [source, setSource] = useState<{
    name: string;
    html: string;
    css: string;
    fonts: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const ai = AI_FORMATS.includes(format);
  const base = slugify(props.projectName);

  // Reset when the dialog opens: Selection when something is pointed at.
  useEffect(() => {
    if (!open) return;
    setScope(canSelect ? "selection" : "prototype");
    setError("");
    setSource(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, version.id]);
  useEffect(() => {
    if (!formats.includes(format)) setFormat(formats[0]);
  }, [formats, format]);

  // Load what's being exported: the document, or the pointed-at elements with their CSS.
  useEffect(() => {
    if (!open || bundle) return;
    let gone = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        if (scope === "prototype") {
          const html = await props.loadHtml();
          if (!gone)
            setSource({ name: props.projectName, html, css: "", fonts: [] });
        } else {
          const parts = await Promise.all(
            targets.map((t) => props.extract!(t)),
          );
          if (gone) return;
          setSource({
            name: targets.map((t) => pointedName(t)).join(" and "),
            html: parts.map((p) => p.html).join("\n\n"),
            css: [...new Set(parts.map((p) => p.css))].join("\n\n"),
            fonts: [...new Set(parts.flatMap((p) => p.fonts))],
          });
        }
      } catch (e) {
        if (!gone)
          setError(
            e instanceof Error ? e.message : "Couldn't read the prototype.",
          );
      } finally {
        if (!gone) setLoading(false);
      }
    })();
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope, version.id, targets, bundle]);

  // File formats are made right here; AI formats wait for Generate.
  useEffect(() => {
    setActive(0);
    if (ai || bundle || !source) return setFiles(null);
    if (format === "html")
      setFiles([
        {
          path: `${base}-v${version.number}.html`,
          content: cleanHtml(source.html),
        },
      ]);
    else if (format === "zip") setFiles(splitHtml(source.html));
    else if (format === "part-html") setFiles(partFiles(source));
  }, [format, source, ai, bundle, base, version.number]);

  const estimate = source
    ? estimateMicros(format, source.html.length + source.css.length)
    : 0;

  function log() {
    void fetch(`/api/projects/${props.projectId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        format,
        versionId: version.id,
        selection:
          scope === "selection"
            ? targets.map((t) => ({ label: t.label, selector: t.selector }))
            : [],
      }),
    }).catch(() => undefined);
  }

  async function generate() {
    if (!source) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${props.projectId}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format,
          versionId: version.id,
          name: props.projectName,
          selection:
            scope === "selection"
              ? [
                  {
                    label: source.name,
                    selector: targets.map((t) => t.selector).join(", "),
                    html: source.html,
                    css: source.css,
                  },
                ]
              : [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data.error || `Export failed (${res.status})`);
      setFiles(data.files as ExportFile[]);
      setActive(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The export didn't finish.");
    } finally {
      setGenerating(false);
    }
  }

  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function download() {
    if (bundle) {
      window.location.href = `/api/projects/${props.projectId}/export/bundle?version=${version.id}`;
      return;
    }
    if (!files?.length) return;
    if (files.length === 1) {
      save(
        new Blob([files[0].content], { type: "text/plain" }),
        files[0].path.split("/").pop()!,
      );
    } else {
      const zipped = zipSync(
        Object.fromEntries(files.map((f) => [f.path, strToU8(f.content)])),
        { level: 6 },
      );
      const name =
        scope === "selection"
          ? slugify(source?.name ?? "part", "part")
          : `${base}-v${version.number}`;
      save(
        new Blob([zipped as BlobPart], { type: "application/zip" }),
        `${name}.zip`,
      );
    }
    if (!ai) log();
  }

  async function copy() {
    const f = files?.[active];
    if (!f) return;
    await navigator.clipboard.writeText(f.content);
    notify.success(`Copied ${f.path}`);
    if (!ai) log();
  }

  const shown = files?.[active];
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-stone-100 p-5">
          <DialogTitle>Export v{version.number}</DialogTitle>
          <DialogDescription>
            {bundle
              ? "This version is an imported app, so it exports as the files it's served from."
              : "Take the whole prototype, or the elements you pointed at, as files or as components."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-2">
          <div className="space-y-5 border-stone-100 p-5 md:border-r">
            {!bundle && (
              <div
                role="radiogroup"
                aria-label="What to export"
                className="grid grid-cols-2 gap-2"
              >
                <ScopeOption
                  on={scope === "prototype"}
                  onClick={() => setScope("prototype")}
                  title="Whole prototype"
                  detail="Every screen, style and script"
                />
                <ScopeOption
                  on={scope === "selection"}
                  disabled={!canSelect}
                  onClick={() => setScope("selection")}
                  title={
                    targets.length > 1
                      ? `${targets.length} elements`
                      : "Selection"
                  }
                  detail={
                    canSelect
                      ? targets.map((t) => pointedName(t)).join(", ")
                      : "Use Select in the preview to point at an element first"
                  }
                />
              </div>
            )}

            <div role="radiogroup" aria-label="Format" className="space-y-2">
              {formats.map((f) => {
                const on = f === format;
                const isAi = AI_FORMATS.includes(f);
                const cost =
                  isAi && source
                    ? estimateMicros(f, source.html.length + source.css.length)
                    : 0;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setFormat(f);
                      if (AI_FORMATS.includes(f)) setFiles(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                      on
                        ? "border-raspberry-600 bg-raspberry-50"
                        : "border-stone-200 hover:bg-stone-50",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full border-2",
                        on ? "border-raspberry-700" : "border-stone-300",
                      )}
                    >
                      {on && (
                        <span className="size-1.5 rounded-full bg-raspberry-700" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {FORMAT_INFO[f].name}
                      </span>
                      <span className="block text-xs text-stone-600">
                        {FORMAT_INFO[f].detail}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                        isAi
                          ? "bg-violet-50 text-violet-800"
                          : "bg-stone-100 text-stone-700",
                      )}
                    >
                      {isAi
                        ? cost
                          ? `AI · about ${formatUsd(cost)}`
                          : "AI"
                        : "Free"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-72 min-w-0 flex-col gap-3 bg-stone-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
              Files
            </p>
            {bundle ? (
              <p className="text-sm text-stone-700">
                Every file of this build, zipped as it&apos;s served.
              </p>
            ) : loading ? (
              <p className="text-sm text-stone-600">Reading the prototype…</p>
            ) : files ? (
              <>
                <ul className="space-y-0.5 font-mono text-xs">
                  {files.map((f, i) => (
                    <li key={f.path}>
                      <button
                        type="button"
                        onClick={() => setActive(i)}
                        aria-current={i === active || undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                          i === active
                            ? "bg-raspberry-50 text-raspberry-900"
                            : "hover:bg-stone-100",
                        )}
                      >
                        {f.path.includes("/") ? (
                          <FolderClosed
                            className="size-3.5 shrink-0 text-stone-500"
                            aria-hidden="true"
                          />
                        ) : (
                          <FileCode2
                            className="size-3.5 shrink-0 text-raspberry-700"
                            aria-hidden="true"
                          />
                        )}
                        <span className="flex-1 truncate">{f.path}</span>
                        <span className="text-stone-500">
                          {(new Blob([f.content]).size / 1024).toFixed(1)} KB
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {shown && (
                  <pre className="max-h-80 min-h-40 flex-1 overflow-auto rounded-2xl bg-stone-900 p-4 font-mono text-xs leading-5 text-stone-100 dark:bg-stone-950">
                    {shown.content.slice(0, 20_000)}
                    {shown.content.length > 20_000 && "\n…"}
                  </pre>
                )}
              </>
            ) : ai ? (
              <p className="text-sm text-stone-700">
                An AI writes these files. It runs as a build, shows in Usage
                {estimate
                  ? `, and should cost about ${formatUsd(estimate)}`
                  : ""}
                . A failed export costs nothing.
              </p>
            ) : null}
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="items-center gap-2 border-t border-stone-100 p-4 sm:justify-between">
          <p className="text-xs text-stone-600">
            {ai
              ? "AI exports appear in Usage."
              : "Made in your browser. No usage charge."}
          </p>
          <div className="flex gap-2">
            {files && files.length > 0 && (
              <Button variant="outline" onClick={copy}>
                <Copy />
                Copy file
              </Button>
            )}
            {ai && !files ? (
              <Button
                variant="default"
                onClick={generate}
                loading={generating}
                disabled={!source || loading}
              >
                <Sparkles />
                {generating ? "Generating…" : "Generate"}
              </Button>
            ) : (
              <Button
                variant="default"
                onClick={download}
                disabled={!bundle && (!files || !files.length)}
              >
                <Download />
                {files && files.length === 1 ? "Download file" : "Download ZIP"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption(props: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.on}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        "rounded-2xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        props.on
          ? "border-raspberry-600 bg-raspberry-50"
          : "border-stone-200 hover:bg-stone-50",
      )}
    >
      <span className="block text-sm font-semibold">{props.title}</span>
      <span className="mt-0.5 line-clamp-2 block text-xs text-stone-600">
        {props.detail}
      </span>
    </button>
  );
}
