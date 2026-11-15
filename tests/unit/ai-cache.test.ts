// Prompt caching: the project context is cached, continuation text is cached, and cached
// tokens are billed at their real rates.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const sent: { system: unknown; messages: { content: unknown }[] }[] = [];
let replies: { text: string; stop: string; usage: Record<string, number> }[];

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      stream: (params: {
        system: unknown;
        messages: { content: unknown }[];
      }) => {
        sent.push(JSON.parse(JSON.stringify(params)));
        const r = replies.shift()!;
        return {
          finalMessage: async () => ({
            content: [{ type: "text", text: r.text }],
            stop_reason: r.stop,
            usage: r.usage,
          }),
        };
      },
    };
  },
}));

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  sent.length = 0;
});

describe("prompt caching", () => {
  it("bills cache writes at 1.25x and reads at 0.1x of an input token", async () => {
    const { billableInput } = await import("@/lib/ai");
    expect(
      billableInput({
        input_tokens: 1000,
        cache_creation_input_tokens: 4000,
        cache_read_input_tokens: 10_000,
      }),
    ).toBe(1000 + 5000 + 1000);
    expect(billableInput(null)).toBe(0);
  });

  it("caches the project context and the text of a continued reply", async () => {
    replies = [
      {
        text: "<summary>Shop</summary><document><html><body>",
        stop: "max_tokens",
        usage: {
          input_tokens: 500,
          output_tokens: 32000,
          cache_creation_input_tokens: 3000,
        },
      },
      {
        text: "Hi</body></html></document>",
        stop: "end_turn",
        usage: {
          input_tokens: 600,
          output_tokens: 100,
          cache_read_input_tokens: 3000,
        },
      },
    ];
    const { generatePrototype } = await import("@/lib/ai");
    const r = await generatePrototype({
      prompt: "A shop",
      currentHtml: null,
      history: [],
      context: "Design system: Acme. ".repeat(50),
      deadline: Date.now() + 280_000,
    });
    const system = sent[0].system as {
      text: string;
      cache_control?: unknown;
    }[];
    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toBeUndefined();
    expect(system[1]).toMatchObject({ cache_control: { type: "ephemeral" } });
    expect(system[1].text).toMatch(/^About this project:/);
    const partial = sent[1].messages.at(-2)!.content as {
      cache_control?: unknown;
    }[];
    expect(partial[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
    // 500 + 3000 × 1.25 + 600 + 3000 × 0.1
    expect(r.usage.input).toBe(500 + 3750 + 600 + 300);
  });

  it("marks the base prompt for caching when there's no project context", async () => {
    const { systemBlocks } = await import("@/lib/ai");
    expect(systemBlocks("Base")).toEqual([
      { type: "text", text: "Base", cache_control: { type: "ephemeral" } },
    ]);
  });
});
