"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A prototype's card image: a screenshot of its latest version, or the brand gradient until one
 * exists. Phone and tablet screenshots sit in a small device frame.
 */
export function ProjectThumb({
  src,
  name,
  portrait,
  capturing,
}: {
  src?: string;
  name: string;
  portrait: boolean;
  capturing: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const show = src && !broken;
  return (
    <div
      className={cn(
        "relative mb-3 aspect-[16/10] overflow-hidden rounded-2xl",
        show && !portrait
          ? "bg-stone-100"
          : "bg-gradient-to-br from-ember-100 via-raspberry-100 to-violet-100",
      )}
    >
      {show ? (
        portrait ? (
          <div className="absolute inset-x-0 top-3 mx-auto h-[calc(100%+2rem)] w-[38%] rounded-t-[1.1rem] bg-[#1c1917] p-1 pb-0 shadow-[0_12px_24px_-12px_rgba(28,25,23,.5)] transition-transform duration-(--duration-base) ease-(--ease-out) group-hover:-translate-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, sized by CSS */}
            <img
              src={src}
              alt={`Preview of ${name}`}
              onError={() => setBroken(true)}
              className="size-full rounded-t-[0.85rem] object-cover object-top"
            />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, sized by CSS
          <img
            src={src}
            alt={`Preview of ${name}`}
            onError={() => setBroken(true)}
            className="size-full object-cover object-top transition-transform duration-(--duration-slow) ease-(--ease-out) group-hover:scale-[1.02]"
          />
        )
      ) : (
        <span aria-hidden="true" />
      )}
      {capturing && (
        <span className="absolute bottom-2 right-2 rounded-full bg-card/85 px-2 py-0.5 text-[10px] font-medium text-stone-600 backdrop-blur">
          {show ? "Updating preview…" : "Making preview…"}
        </span>
      )}
    </div>
  );
}

/** While previews are being made, check back a few times so they appear without a reload. */
export function ThumbRefresher({ pending }: { pending: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const timers = [8_000, 18_000, 35_000].map((ms) =>
      setTimeout(() => router.refresh(), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [pending, router]);
  return null;
}
