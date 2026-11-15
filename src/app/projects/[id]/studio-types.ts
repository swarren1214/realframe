/** What a successful action says: a message, or a message with Undo or another action. */
export type Done =
  | string
  | {
      title: string;
      undo?: () => Promise<unknown>;
      action?: { label: string; onClick: () => void };
    };

/** Runs a server action with a busy state for `key` and a toast when it's `done`. */
export type Run = (
  action: () => Promise<void | Done>,
  key?: string,
  done?: Done,
) => void;
