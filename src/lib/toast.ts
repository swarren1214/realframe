"use client";
import { toast } from "sonner";

// One place for how Realframe talks about results. Successes last 4 s, errors 8 s.
type Action = { label: string; onClick: () => void | Promise<unknown> };

export const notify = {
  success(
    title: string,
    opts: {
      description?: string;
      action?: Action;
      undo?: () => void | Promise<unknown>;
    } = {},
  ) {
    return toast.success(title, {
      description: opts.description,
      action: opts.undo
        ? {
            label: "Undo",
            onClick: async () => {
              try {
                await opts.undo!();
              } catch (err) {
                notify.error(
                  err instanceof Error ? err.message : "Couldn't undo that.",
                );
              }
            },
          }
        : opts.action
          ? {
              label: opts.action.label,
              onClick: () => void opts.action!.onClick(),
            }
          : undefined,
    });
  },
  error(title: string, opts: { description?: string; action?: Action } = {}) {
    return toast.error(title, {
      description: opts.description,
      duration: 8000,
      closeButton: true,
      action: opts.action
        ? {
            label: opts.action.label,
            onClick: () => void opts.action!.onClick(),
          }
        : undefined,
    });
  },
  info(title: string, description?: string) {
    return toast(title, { description });
  },
};

/** Copies text and confirms it. */
export async function copyWithToast(text: string, label = "Link copied") {
  try {
    await navigator.clipboard.writeText(text);
    notify.success(label);
  } catch {
    notify.error("Couldn't copy. Select the link and copy it instead.");
  }
}
