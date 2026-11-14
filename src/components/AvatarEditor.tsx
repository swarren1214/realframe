"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { unwrapped } from "@/lib/safe-action";
import { notify } from "@/lib/toast";
import {
  removeAvatar as raw_removeAvatar,
  setAvatar as raw_setAvatar,
} from "@/app/welcome/avatar-actions";
import { cn } from "@/lib/utils";

const setAvatar = unwrapped(raw_setAvatar);
const removeAvatar = unwrapped(raw_removeAvatar);

/** Crop area and exported image size, in pixels. */
const STAGE = 288;
const OUT = 512;
const MAX_ZOOM = 4;

type View = { zoom: number; x: number; y: number };

export function initialsFor(name: string | null | undefined, email: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length)
    return (
      (parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
    ).toUpperCase();
  return (email[0] ?? "").toUpperCase();
}

/** A person's round photo, or their initials on the brand gradient. */
export function Avatar({
  url,
  initials,
  className,
}: {
  url?: string | null;
  initials: string;
  className?: string;
}) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- small public image, sized by CSS
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className={cn(
        "shrink-0 rounded-full bg-stone-200 object-cover",
        className,
      )}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,#c2410c_0%,#be185d_55%,#7c3aed_100%)] font-semibold text-white",
        className,
      )}
    >
      {initials || <UserRound className="size-1/2" />}
    </span>
  );
}

/** Keeps the image covering the whole crop circle. */
function clamp(v: View, w: number, h: number): View {
  const base = Math.max(STAGE / w, STAGE / h);
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const dw = w * base * zoom;
  const dh = h * base * zoom;
  return {
    zoom,
    x: Math.min(0, Math.max(STAGE - dw, v.x)),
    y: Math.min(0, Math.max(STAGE - dh, v.y)),
  };
}

function centered(w: number, h: number): View {
  const base = Math.max(STAGE / w, STAGE / h);
  return { zoom: 1, x: (STAGE - w * base) / 2, y: (STAGE - h * base) / 2 };
}

/** The photo field on the account page: upload, then position and scale before saving. */
export function AvatarEditor({
  url,
  name,
  email,
}: {
  url: string | null;
  name: string | null;
  email: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const drag = useRef<{
    id: number;
    sx: number;
    sy: number;
    x: number;
    y: number;
  } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => () => void (src && URL.revokeObjectURL(src)), [src]);

  function choose(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/"))
      return notify.error("Choose an image file.");
    if (file.size > 20 * 1024 * 1024)
      return notify.error("That image is over 20 MB.");
    const u = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setSrc(u);
      setView(centered(el.naturalWidth, el.naturalHeight));
    };
    el.onerror = () =>
      notify.error("Couldn't open that image. Try a JPEG or PNG.");
    el.src = u;
  }

  const zoomTo = useCallback(
    (zoom: number, cx = STAGE / 2, cy = STAGE / 2) => {
      if (!img) return;
      setView((v) => {
        // Keep the point under (cx, cy) in place while scaling.
        const k = Math.min(MAX_ZOOM, Math.max(1, zoom)) / v.zoom;
        return clamp(
          { zoom: v.zoom * k, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k },
          img.naturalWidth,
          img.naturalHeight,
        );
      });
    },
    [img],
  );

  function close() {
    setImg(null);
    setSrc(null);
    if (input.current) input.current.value = "";
  }

  async function save() {
    if (!img) return;
    setBusy("save");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d")!;
      const base =
        Math.max(STAGE / img.naturalWidth, STAGE / img.naturalHeight) *
        view.zoom;
      const k = OUT / STAGE;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        view.x * k,
        view.y * k,
        img.naturalWidth * base * k,
        img.naturalHeight * base * k,
      );
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/webp", 0.88),
      );
      const type = blob?.type === "image/webp" ? "image/webp" : "image/jpeg";
      const file =
        blob?.type === "image/webp"
          ? blob
          : await new Promise<Blob | null>((r) =>
              canvas.toBlob(r, "image/jpeg", 0.9),
            );
      if (!file) throw new Error("Couldn't prepare the photo.");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to change your photo.");
      const path = `${user.id}/${crypto.randomUUID()}.${type === "image/webp" ? "webp" : "jpg"}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: type, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
      await setAvatar(
        supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl,
      );
      notify.success("Photo updated");
      close();
      router.refresh();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Couldn't save the photo.");
    } finally {
      setBusy(null);
    }
  }

  const initials = initialsFor(name, email);
  const base = img
    ? Math.max(STAGE / img.naturalWidth, STAGE / img.naturalHeight) * view.zoom
    : 1;
  const dw = img ? img.naturalWidth * base : 0;
  const dh = img ? img.naturalHeight * base : 0;

  /** The cropped photo at any size, drawn with the same view as the editor. */
  const preview = (size: number) => (
    <span
      aria-hidden="true"
      className="block shrink-0 rounded-full bg-stone-200 bg-no-repeat"
      style={{
        width: size,
        height: size,
        backgroundImage: src ? `url(${src})` : undefined,
        backgroundSize: `${(dw * size) / STAGE}px ${(dh * size) / STAGE}px`,
        backgroundPosition: `${(view.x * size) / STAGE}px ${(view.y * size) / STAGE}px`,
      }}
    />
  );

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative shrink-0 rounded-full"
        aria-label={url ? "Change photo" : "Add a photo"}
      >
        <Avatar url={url} initials={initials} className="size-16 text-lg" />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity duration-(--duration-fast) group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-5" aria-hidden="true" />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Profile photo</p>
        <p className="text-xs text-stone-500">
          Shown on your comments and to your team.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => input.current?.click()}
          >
            <Upload />
            {url ? "Change" : "Upload photo"}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={busy === "remove"}
              onClick={async () => {
                setBusy("remove");
                try {
                  await removeAvatar();
                  notify.success("Photo removed");
                  router.refresh();
                } catch (e) {
                  notify.error(
                    e instanceof Error ? e.message : "Couldn't remove it.",
                  );
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Trash2 />
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => choose(e.target.files?.[0])}
      />

      <Dialog open={Boolean(img)} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Position your photo</DialogTitle>
            <DialogDescription>
              Drag to move it. Use the slider, scroll or pinch to zoom.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div
              role="application"
              aria-label="Photo crop area. Arrow keys move the photo; plus and minus zoom."
              tabIndex={0}
              className="relative cursor-grab touch-none overflow-hidden rounded-2xl bg-stone-900 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:cursor-grabbing"
              style={{ width: STAGE, height: STAGE }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                pointers.current.set(e.pointerId, {
                  x: e.clientX,
                  y: e.clientY,
                });
                if (pointers.current.size === 2) {
                  const [a, b] = [...pointers.current.values()];
                  pinch.current = {
                    dist: Math.hypot(a.x - b.x, a.y - b.y),
                    zoom: view.zoom,
                  };
                  drag.current = null;
                } else
                  drag.current = {
                    id: e.pointerId,
                    sx: e.clientX,
                    sy: e.clientY,
                    x: view.x,
                    y: view.y,
                  };
              }}
              onPointerMove={(e) => {
                if (!img || !pointers.current.has(e.pointerId)) return;
                pointers.current.set(e.pointerId, {
                  x: e.clientX,
                  y: e.clientY,
                });
                if (pinch.current && pointers.current.size === 2) {
                  const [a, b] = [...pointers.current.values()];
                  zoomTo(
                    (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
                      pinch.current.dist,
                  );
                } else if (drag.current?.id === e.pointerId) {
                  const d = drag.current;
                  setView((v) =>
                    clamp(
                      {
                        ...v,
                        x: d.x + e.clientX - d.sx,
                        y: d.y + e.clientY - d.sy,
                      },
                      img.naturalWidth,
                      img.naturalHeight,
                    ),
                  );
                }
              }}
              onPointerUp={(e) => {
                pointers.current.delete(e.pointerId);
                if (pointers.current.size < 2) pinch.current = null;
                if (drag.current?.id === e.pointerId) drag.current = null;
              }}
              onPointerCancel={(e) => {
                pointers.current.delete(e.pointerId);
                pinch.current = null;
                drag.current = null;
              }}
              onWheel={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                zoomTo(
                  view.zoom * Math.exp(-e.deltaY / 400),
                  e.clientX - r.left,
                  e.clientY - r.top,
                );
              }}
              onKeyDown={(e) => {
                if (!img) return;
                const step = e.shiftKey ? 20 : 6;
                const move: Record<string, [number, number]> = {
                  ArrowLeft: [step, 0],
                  ArrowRight: [-step, 0],
                  ArrowUp: [0, step],
                  ArrowDown: [0, -step],
                };
                if (move[e.key]) {
                  e.preventDefault();
                  setView((v) =>
                    clamp(
                      {
                        ...v,
                        x: v.x + move[e.key][0],
                        y: v.y + move[e.key][1],
                      },
                      img.naturalWidth,
                      img.naturalHeight,
                    ),
                  );
                } else if (e.key === "+" || e.key === "=")
                  zoomTo(view.zoom * 1.1);
                else if (e.key === "-") zoomTo(view.zoom / 1.1);
              }}
            >
              {src && (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL being cropped
                <img
                  src={src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-0 top-0 max-w-none"
                  style={{
                    width: dw,
                    height: dh,
                    transform: `translate(${view.x}px, ${view.y}px)`,
                  }}
                />
              )}
              {/* Darken everything outside the circle that will be kept. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  boxShadow: "0 0 0 999px rgb(0 0 0 / 0.55)",
                  outline: "2px solid rgb(255 255 255 / 0.85)",
                  outlineOffset: -1,
                }}
              />
            </div>

            <div className="flex w-full max-w-[18rem] items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                onClick={() => zoomTo(view.zoom / 1.2)}
              >
                <Minus />
              </Button>
              <input
                type="range"
                aria-label="Zoom"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={view.zoom}
                onChange={(e) => zoomTo(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-raspberry-600"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                onClick={() => zoomTo(view.zoom * 1.2)}
              >
                <Plus />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Reset position"
                title="Reset"
                onClick={() =>
                  img && setView(centered(img.naturalWidth, img.naturalHeight))
                }
              >
                <RotateCcw />
              </Button>
            </div>

            <div className="flex w-full items-center justify-center gap-5 rounded-2xl bg-stone-50 px-4 py-3">
              <span className="text-xs text-stone-500">Preview</span>
              {preview(64)}
              {preview(40)}
              {preview(28)}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="button" loading={busy === "save"} onClick={save}>
              Save photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
