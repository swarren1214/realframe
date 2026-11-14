"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileArchive, FileCode2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { SourceZip, mimeFor, readBundle } from "@/lib/bundle";
import { SINGLE_FILE_TYPES } from "@/lib/import";
import { cn } from "@/lib/utils";
import { GitHubImport } from "@/components/GitHubImport";
import { finishBundle, importFile, prepareBundle } from "@/app/projects/actions";
import { buildUploadedSource } from "@/app/projects/github-actions";

const ACCEPT = [...SINGLE_FILE_TYPES, ".zip"].join(",");

/**
 * Import an existing prototype: one HTML or React file (pasted or uploaded), or a zip of a built app.
 * With a projectId it adds a version to that prototype; without one it creates a new prototype.
 */
export function ImportDialog({
  projectId = null,
  trigger,
  onImported,
}: {
  projectId?: string | null;
  trigger: React.ReactNode;
  onImported?: (versionId: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"file" | "paste" | "github">("file");

  // Coming back from GitHub (connect or install) reopens the dialog on the GitHub tab.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("import") === "github") {
      setTab("github");
      setOpen(true);
    }
  }, []);
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [done, setDone] = useState<{ projectId: string; versionId: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setCode("");
    setName("");
    setBusy(false);
    setProgress(null);
    setError("");
    setWarnings([]);
    setDone(null);
  }

  function pick(f: File | undefined | null) {
    if (!f) return;
    setError("");
    setFile(f);
    if (!name) setName(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  }

  function finish(target: { projectId: string; versionId: string }, warn: string[]) {
    if (warn.length) {
      setWarnings(warn);
      setDone(target);
      setBusy(false);
      return;
    }
    go(target);
  }

  function go(target: { projectId: string; versionId: string }) {
    setOpen(false);
    reset();
    if (projectId) {
      onImported?.(target.versionId);
      router.refresh();
    } else {
      router.push(`/projects/${target.projectId}`);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tab === "github") return;
    setError("");
    setBusy(true);
    try {
      if (tab === "paste") {
        if (!code.trim()) throw new Error("Paste some HTML or a React component first.");
        const looksHtml = /^\s*</.test(code) && !/export\s+default/.test(code);
        const r = await importFile(projectId, name, looksHtml ? "pasted.html" : "pasted.tsx", code);
        return finish(r, r.warnings);
      }
      if (!file) throw new Error("Choose a file first.");
      if (!file.name.toLowerCase().endsWith(".zip")) {
        const r = await importFile(projectId, name, file.name, await file.text());
        return finish(r, r.warnings);
      }

      // A built app: check it here, upload the files straight to storage, then record the version.
      let bundle: Awaited<ReturnType<typeof readBundle>>;
      try {
        bundle = await readBundle(file);
      } catch (err) {
        if (!(err instanceof SourceZip)) throw err;
        // Source code (for example an unbuilt Vite app): upload the zip and build it in the sandbox.
        const target = await prepareBundle(projectId, name);
        const uploadPath = `${target.projectId}/uploads/${target.bundleId}.zip`;
        setProgress(30);
        const { error: upErr } = await createClient()
          .storage.from("bundles")
          .upload(uploadPath, file, { contentType: "application/zip", upsert: false });
        if (upErr) throw new Error(`Couldn't upload the zip: ${upErr.message}`);
        setProgress(100);
        await buildUploadedSource(target.projectId, uploadPath, { ...err.settings, label: file.name });
        setOpen(false);
        reset();
        if (projectId) router.refresh();
        else router.push(`/projects/${target.projectId}`);
        return;
      }
      const target = await prepareBundle(projectId, name);
      const supabase = createClient();
      const base = `${target.projectId}/${target.bundleId}/`;
      let doneCount = 0;
      setProgress(0);
      const queue = [...bundle.files];
      const worker = async () => {
        for (let f = queue.shift(); f; f = queue.shift()) {
          const { error: upErr } = await supabase.storage
            .from("bundles")
            .upload(base + f.path, new Blob([f.data as BlobPart], { type: mimeFor(f.path) }), {
              contentType: mimeFor(f.path),
              upsert: false,
            });
          if (upErr) throw new Error(`Couldn't upload ${f.path}: ${upErr.message}`);
          doneCount += 1;
          setProgress(Math.round((doneCount / bundle.files.length) * 100));
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, bundle.files.length) }, worker));
      const { versionId } = await finishBundle(target.projectId, target.bundleId, bundle.files.length, bundle.bytes, file.name);
      return finish({ projectId: target.projectId, versionId }, []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import didn't work.");
      setBusy(false);
      setProgress(null);
    }
  }

  const isZip = file?.name.toLowerCase().endsWith(".zip");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={cn(tab === "github" && "sm:max-w-xl")}>
        <DialogHeader>
          <DialogTitle>{projectId ? "Import a new version" : "Import a prototype"}</DialogTitle>
          <DialogDescription>
            An HTML page, a React component (.jsx or .tsx), a zip of a built app, or a GitHub repository that builds on every push.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <div role="status" className="flex gap-2.5 rounded-2xl bg-amber-50 p-3 text-[13px] text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-semibold">Imported, with a note</p>
                {warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button variant="default" onClick={() => go(done)}>
                Open it
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!projectId && (
              <div>
                <Label htmlFor="import-name" className="mb-1.5">
                  Prototype name
                </Label>
                <Input
                  id="import-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="Dispatch board"
                />
              </div>
            )}

            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="file">
                  <Upload />
                  Upload
                </TabsTrigger>
                <TabsTrigger value="paste">
                  <FileCode2 />
                  Paste code
                </TabsTrigger>
                <TabsTrigger value="github">
                  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
                  </svg>
                  GitHub
                </TabsTrigger>
              </TabsList>
              <TabsContent value="file" className="pt-3">
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pick(e.dataTransfer.files?.[0]);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    dragging ? "border-raspberry-600 bg-raspberry-50" : "border-stone-300 bg-stone-50/60 hover:border-stone-400",
                  )}
                >
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-2xl bg-glow-soft text-raspberry-700">
                    {isZip ? <FileArchive className="size-5" /> : <Upload className="size-5" />}
                  </span>
                  {file ? (
                    <span className="text-[13px]">
                      <span className="font-semibold">{file.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(0)} KB · click to choose another
                      </span>
                    </span>
                  ) : (
                    <span className="text-[13px] text-stone-600">
                      <span className="font-semibold text-foreground">Drop a file here</span> or click to choose
                      <span className="block text-xs text-muted-foreground">.html, .jsx, .tsx or .zip, up to 25 MB</span>
                    </span>
                  )}
                </button>
                <input
                  ref={input}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => pick(e.target.files?.[0])}
                />
              </TabsContent>
              <TabsContent value="github" className="pt-3">
                <GitHubImport projectId={projectId} name={name} onBusy={setBusy} />
              </TabsContent>
              <TabsContent value="paste" className="pt-3">
                <Label htmlFor="import-code" className="sr-only">
                  Code
                </Label>
                <Textarea
                  id="import-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={"<!doctype html>… or export default function App() { … }"}
                  className="field-sizing-fixed h-48 resize-y font-mono text-xs"
                  spellCheck={false}
                />
              </TabsContent>
            </Tabs>

            {progress !== null && (
              <div className="space-y-1.5" role="status">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground">Uploading files… {progress}%</p>
              </div>
            )}
            {error && (
              <p role="alert" className="flex gap-2 rounded-2xl bg-red-50 p-3 text-xs text-red-800">
                <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            {tab !== "github" && (
              <DialogFooter>
                <Button variant="default" type="submit" loading={busy}>
                  <Upload />
                  {projectId ? "Import as new version" : "Import"}
                </Button>
              </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
