"use client";
import { useEffect, useState } from "react";

/**
 * Whether the screen is at least the `lg` breakpoint (1024px), where side panels
 * sit beside the content rather than in a drawer. Assumes large before the first
 * effect, so a desktop never starts with its panel switched off.
 */
export function useIsLarge() {
  const [large, setLarge] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setLarge(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return large;
}
