import "server-only";

/** Whether the caller asked for progress lines rather than one JSON answer. */
export function wantsProgress(request: Request) {
  return (request.headers.get("accept") ?? "").includes("application/x-ndjson");
}

/**
 * Runs `work` and answers with newline-delimited JSON: {"type":"progress","chars":N} lines
 * (at most every 750 ms) while it runs, then one {"type":"result","status":…,"body":…} line
 * with what `work` would have answered on its own. Keeps one code path for both answers.
 */
export function progressResponse(
  work: (progress: (chars: number) => void) => Promise<Response>,
) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
        } catch {
          // The reader went away; the work still finishes and settles itself.
        }
      };
      let last = 0;
      const progress = (chars: number) => {
        const now = Date.now();
        if (now - last < 750) return;
        last = now;
        send({ type: "progress", chars });
      };
      let res: Response;
      try {
        res = await work(progress);
      } catch (e) {
        res = Response.json(
          { error: e instanceof Error ? e.message : "Something went wrong." },
          { status: 500 },
        );
      }
      send({
        type: "result",
        status: res.status,
        body: await res.json().catch(() => ({})),
      });
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
