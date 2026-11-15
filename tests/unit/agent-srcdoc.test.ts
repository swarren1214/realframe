// Prototypes in a srcdoc frame: links and forms must stay inside the prototype, or the frame
// loads Realframe's own page (which refuses framing) and goes blank.
import { describe, expect, it } from "vitest";
import { withAgent } from "@/lib/agent";

const doc = `<!doctype html><html><head><title>x</title></head><body><a href="#/library">L</a></body></html>`;

describe("withAgent in a srcdoc frame", () => {
  it("puts a base of about:srcdoc first in <head>, before any script", () => {
    const out = withAgent(doc, { srcdoc: true });
    expect(out).toMatch(/<head><base href="about:srcdoc"><script>/);
  });

  it("keeps a base the prototype set itself", () => {
    const own = doc.replace("<title>", `<base href="https://cdn.example.com/"><title>`);
    const out = withAgent(own, { srcdoc: true });
    expect(out).not.toContain("about:srcdoc");
    expect(out).toContain(`<base href="https://cdn.example.com/">`);
  });

  it("works without a <head>", () => {
    expect(withAgent(`<div>hi</div>`, { srcdoc: true })).toMatch(/^<base href="about:srcdoc">/);
  });

  it("leaves documents served by URL alone", () => {
    expect(withAgent(doc)).not.toContain("about:srcdoc");
  });
});

describe("agent script", () => {
  it("is valid JavaScript", async () => {
    const { AGENT_SCRIPT } = await import("@/lib/agent");
    expect(() => new Function(AGENT_SCRIPT)).not.toThrow();
  });
});
