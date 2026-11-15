import type { Instrumentation } from "next";

export function register() {}

/** Server errors go to app_errors, as well as the logs. */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/errors");
  const e = err as { message?: string; digest?: string; stack?: string };
  await recordError({
    source: "server",
    message: e?.message ?? String(err),
    digest: e?.digest ?? null,
    path: request.path,
    method: request.method,
    route: context.routePath,
    routeType: context.routeType,
    stack: e?.stack ?? null,
  });
};
