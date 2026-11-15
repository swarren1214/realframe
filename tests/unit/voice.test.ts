import { describe, expect, it } from "vitest";
import { appendTranscript, clock, voiceCommand } from "@/lib/voice";

describe("voice commands", () => {
  it("recognises a few whole phrases", () => {
    expect(voiceCommand("Send.")).toEqual({ kind: "send" });
    expect(voiceCommand("never mind")).toEqual({ kind: "cancel" });
    expect(voiceCommand("Open dev mode")).toEqual({ kind: "inspect" });
    expect(voiceCommand("go to version 4")).toEqual({
      kind: "version",
      number: 4,
    });
    expect(voiceCommand("Go to version four")).toEqual({
      kind: "version",
      number: 4,
    });
    expect(voiceCommand("show v12")).toEqual({ kind: "version", number: 12 });
  });

  it("never treats a prompt as a command", () => {
    expect(voiceCommand("send the user to the pricing page")).toBeNull();
    expect(voiceCommand("cancel button should be red")).toBeNull();
    expect(voiceCommand("go to version zero")).toBeNull();
  });
});

describe("transcripts", () => {
  it("starts with a capital and joins with a space", () => {
    expect(appendTranscript("", "make this bigger")).toBe("Make this bigger");
    expect(appendTranscript("Make this bigger", "and pink")).toBe(
      "Make this bigger and pink",
    );
    expect(appendTranscript("Make this bigger.", "then add a badge")).toBe(
      "Make this bigger. Then add a badge",
    );
    expect(appendTranscript("Keep  ", "  ")).toBe("Keep  ");
  });

  it("formats the timer", () => {
    expect(clock(4200)).toBe("0:04");
    expect(clock(75_000)).toBe("1:15");
  });
});
