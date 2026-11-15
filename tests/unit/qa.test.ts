// The browser check's helpers: the document it loads, its report, and the fix request.
import { describe, expect, it } from "vitest";
import { fixPrompt, needsFix, prepareDocument, qaSummary, readReport, type QaReport } from "@/lib/qa";
import { REPORT_END, REPORT_START } from "@/lib/qa/script";

const report = (issues: QaReport["issues"]): QaReport => ({
  ok: true,
  screens: ["(start)", "#/library"],
  tested: 9,
  issues,
});

describe("prepareDocument", () => {
  it("loads like the Studio: base first, then Realframe's scripts, then the probe, then the prototype", () => {
    const out = prepareDocument(
      "<!doctype html><html><head><title>x</title><script>app()</script></head><body></body></html>",
    );
    const base = out.indexOf('<base href="about:srcdoc">');
    const probe = out.indexOf("window.__qa");
    const app = out.indexOf("app()");
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThan(probe);
    expect(probe).toBeLessThan(app);
  });
});

describe("readReport", () => {
  it("reads the report between its markers, ignoring other output", () => {
    const r = report([]);
    expect(readReport(`noise\n${REPORT_START}${JSON.stringify(r)}${REPORT_END}\n`)).toEqual(r);
    expect(readReport("crashed")).toBeNull();
  });
});

describe("needsFix and the fix request", () => {
  const blank = {
    severity: "major" as const,
    kind: "blank" as const,
    where: "#/library",
    detail: "This screen is blank.",
  };
  it("fixes errors, blank screens, dead controls and sideways scrolling", () => {
    expect(needsFix(report([]))).toBe(false);
    expect(needsFix(report([blank]))).toBe(true);
    expect(
      needsFix(report([{ severity: "minor", kind: "dead", where: '"Share"', detail: "does nothing" }])),
    ).toBe(true);
  });
  it("tells the builder what was found and what to keep", () => {
    const p = fixPrompt("Influencer app", report([blank]));
    expect(p).toContain("#/library: This screen is blank.");
    expect(p).toContain("tapped 9 controls");
    expect(p).toContain("Keep everything else the same");
  });
  it("sums up for the chat", () => {
    expect(qaSummary(report([]), false)).toBe("Checked 2 screens and 9 taps: no problems found.");
    expect(qaSummary(report([blank]), true)).toBe("Checked 2 screens and 9 taps: found 1 problem and fixed it.");
  });
});
