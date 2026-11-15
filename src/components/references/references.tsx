"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { notify } from "@/lib/toast";

export const MAX_REFERENCES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1568;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const REFERENCE_ACCEPT = [...IMAGE_TYPES, "application/pdf"].join(",");

export type Reference = { path: string; name: string; type: string };
type Item = Reference & { id: string; preview: string | null; uploading: boolean };

/** Shrinks a large image so the model sees it at full detail without wasting tokens. */
async function downscale(file: File): Promise<Blob> {
  if (file.type === "image/gif" || !file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.88));
  return blob && blob.size < file.size ? blob : file;
}

/**
 * Reference images and PDFs attached to a prompt. Files upload as soon as
 * they're added, into `folder` (a prototype id, or "pending/<user id>").
 */
export function useReferences(folder: string | null) {
  const [items, setItems] = useState<Item[]>([]);
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach(URL.revokeObjectURL), []);

  const add = useCallback(
    async (files: FileList | File[]) => {
      if (!folder) return;
      const list = Array.from(files);
      const room = MAX_REFERENCES - items.length;
      if (list.length > room)
        notify.info(`Up to ${MAX_REFERENCES} references per prompt.`);
      const accepted = list.slice(0, Math.max(0, room)).filter((f) => {
        if (![...IMAGE_TYPES, "application/pdf"].includes(f.type)) {
          notify.error(`${f.name} isn't an image or PDF.`);
          return false;
        }
        return true;
      });
      const supabase = createClient();
      await Promise.all(
        accepted.map(async (file) => {
          const id = crypto.randomUUID();
          const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
          if (preview) previews.current.push(preview);
          const blob = await downscale(file);
          const type = blob.type || file.type;
          const safe = file.name.replace(/[^\w.-]+/g, "-").slice(-60) || "file";
          const path = `${folder}/${id}-${safe}`;
          setItems((cur) => [...cur, { id, path, name: file.name, type, preview, uploading: true }]);
          if (blob.size > MAX_BYTES) {
            notify.error(`${file.name} is over 10 MB.`);
            setItems((cur) => cur.filter((x) => x.id !== id));
            return;
          }
          const { error } = await supabase.storage
            .from("references")
            .upload(path, blob, { contentType: type });
          if (error) {
            notify.error(`Couldn't attach ${file.name}`, { description: error.message });
            setItems((cur) => cur.filter((x) => x.id !== id));
          } else {
            setItems((cur) => cur.map((x) => (x.id === id ? { ...x, uploading: false } : x)));
          }
        }),
      );
    },
    [folder, items.length],
  );

  const remove = (id: string) => setItems((cur) => cur.filter((x) => x.id !== id));
  const clear = () => setItems([]);
  const ready: Reference[] = items
    .filter((x) => !x.uploading)
    .map(({ path, name, type }) => ({ path, name, type }));

  /** Paste and drop handlers for the prompt box. */
  const handlers = {
    onPaste: (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      if (files.length) {
        e.preventDefault();
        void add(files);
      }
    },
    onDragOver: (e: React.DragEvent) => {
      if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      void add(e.dataTransfer.files);
    },
  };

  return {
    items,
    ready,
    uploading: items.some((x) => x.uploading),
    full: items.length >= MAX_REFERENCES,
    add,
    remove,
    clear,
    handlers,
  };
}

export type References = ReturnType<typeof useReferences>;

/** The paperclip-style button that opens the file picker (and the camera on phones). */
export function AttachButton({
  refs,
  disabled,
  className = "",
}: {
  refs: References;
  disabled?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={disabled || refs.full}
        onClick={() => input.current?.click()}
        aria-label="Attach reference images"
        title="Attach screenshots, sketches or PDFs. You can also paste or drop them."
        className={`grid size-9 shrink-0 place-items-center rounded-full text-stone-600 transition-colors hover:bg-secondary hover:text-stone-900 disabled:opacity-40 ${className}`}
      >
        <ImagePlus className="size-4" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={REFERENCE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Reference images or PDFs"
        onChange={(e) => {
          if (e.target.files) void refs.add(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Thumbnails of what's attached, each removable. */
export function ReferenceTray({ refs }: { refs: References }) {
  if (!refs.items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2 px-1.5 pb-1.5 pt-1" aria-label="Attached references">
      {refs.items.map((r) => (
        <li key={r.id} className="relative">
          <div className="grid size-14 place-items-center overflow-hidden rounded-xl border border-stone-200 bg-secondary">
            {r.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.preview} alt={r.name} className="size-full object-cover" />
            ) : (
              <FileText className="size-5 text-stone-500" aria-label={r.name} />
            )}
            {r.uploading && (
              <div className="absolute inset-0 grid place-items-center rounded-xl bg-card/70">
                <Spinner />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => refs.remove(r.id)}
            aria-label={`Remove ${r.name}`}
            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Attachments shown on a sent chat message. Loads short-lived links to the private files. */
export function MessageAttachments({ items }: { items: Reference[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = items.map((i) => i.path).join("|");
  useEffect(() => {
    if (!items.length) return;
    let gone = false;
    createClient()
      .storage.from("references")
      .createSignedUrls(items.map((i) => i.path), 3600)
      .then(({ data }) => {
        if (gone || !data) return;
        const next: Record<string, string> = {};
        for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
        setUrls(next);
      });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!items.length) return null;
  return (
    <ul className="mb-1.5 flex flex-wrap gap-1.5">
      {items.map((r) => (
        <li key={r.path}>
          <a
            href={urls[r.path]}
            target="_blank"
            rel="noreferrer"
            title={r.name}
            className="grid size-12 place-items-center overflow-hidden rounded-lg border border-raspberry-100 bg-white"
          >
            {r.type.startsWith("image/") && urls[r.path] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[r.path]} alt={r.name} className="size-full object-cover" />
            ) : (
              <FileText className="size-4 text-stone-500" aria-label={r.name} />
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
