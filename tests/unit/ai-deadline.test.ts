// generatePrototype stops at its deadline instead of running past the route's time limit.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let reply: (signal: AbortSignal) => Promise<unknown>;
const calls: { signal: AbortSignal }[] = [];

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: (_params: unknown, opts: { signal: AbortSignal }) => {
        calls.push(opts);
        return { finalMessage: () => reply(opts.signal) };
      },
    };
  },
}));

const never = (signal: AbortSignal) =>
  new Promise((_, reject) =>
    signal.addEventListener("abort", () => {
      const e = new Error("Request was aborted.");
      e.name = "APIUserAbortError";
      reject(e);
    }),
  );

const done = (text: string, stop = "end_turn") =>
  Promise.resolve({
    content: [{ type: "text", text }],
    stop_reason: stop,
    usage: { input_tokens: 100, output_tokens: 200 },
  });

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  vi.stubEnv("REALFRAME_FAKE_AI", "");
  calls.length = 0;
});

const input = (deadline: number) => ({
  prompt: "A pricing page",
  currentHtml: null,
  history: [],
  deadline,
});

describe("AI deadlines", () => {
  it("aborts a reply that runs past the deadline and fails cleanly, free", async () => {
    reply = never;
    const { generatePrototype, GenerationError } = await import("@/lib/ai");
    const started = Date.now();
    const err = await generatePrototype(input(Date.now() + 16_000)).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(GenerationError);
    expect(err.message).toMatch(/took too long/);
    expect(Date.now() - started).toBeLessThan(17_500);
  }, 20_000);

  it("doesn't start a continuation without enough time left", async () => {
    reply = () => done("<document><html>", "max_tokens");
    const { generatePrototype } = await import("@/lib/ai");
    const err = await generatePrototype(input(Date.now() + 60_000)).catch(
      (e) => e,
    );
    expect(calls).toHaveLength(1);
    expect(err.message).toMatch(/too big to finish/);
    expect(err.usage).toEqual({ input: 100, output: 200 });
  });

  it("refuses to start at all with almost no time left", async () => {
    reply = () => done("x");
    const { generatePrototype } = await import("@/lib/ai");
    const err = await generatePrototype(input(Date.now() + 5_000)).catch(
      (e) => e,
    );
    expect(calls).toHaveLength(0);
    expect(err.message).toMatch(/took too long/);
  });
});
