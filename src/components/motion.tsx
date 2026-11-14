"use client";
import { MotionConfig } from "motion/react";

export { AnimatePresence, motion } from "motion/react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Props for a list row that fades in, slides its neighbours, and fades out on removal. */
export const listItem = {
  layout: "position",
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: { duration: 0.12 } },
  transition: { duration: 0.2, ease: EASE_OUT },
} as const;

/** Follows the OS "reduce motion" setting for every motion component. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
