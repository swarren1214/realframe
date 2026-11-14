// Server actions that report failures as values. Next.js hides thrown error messages in
// production (the generic "An error occurred in the Server Components render"), so actions
// built with `action()` return { ok, data } or { ok: false, error } and clients call `unwrap`.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function isFrameworkSignal(err: unknown) {
  // redirect() and notFound() work by throwing; let those through.
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND";
}

export function action<A extends unknown[], T>(fn: (...args: A) => Promise<T>) {
  return async (...args: A): Promise<Result<T>> => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      if (isFrameworkSignal(err)) throw err;
      console.error(err);
      return { ok: false, error: err instanceof Error && err.message ? err.message : "Something went wrong." };
    }
  };
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Wraps a Result-returning server action so callers get the value or a thrown, readable Error. */
export function unwrapped<A extends unknown[], T>(fn: (...args: A) => Promise<Result<T>>) {
  return async (...args: A): Promise<T> => unwrap(await fn(...args));
}
