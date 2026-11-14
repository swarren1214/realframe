import { describe, expect, it, beforeAll } from "vitest";
import { costMicros, formatUsd } from "@/lib/billing";
import { makeSlug } from "@/lib/slug";
import {
  cookieDomain,
  isReservedSlug,
  reviewUrlFor,
  subdomainSlug,
} from "@/lib/hosts";
import { parseResponse } from "@/lib/ai";
import { MAX_PROMPT, nameFromPrompt } from "@/lib/prompt-shared";
import { withAgent } from "@/lib/agent";
import { importSingleFile, looksLikeReact } from "@/lib/import";

describe("billing math", () => {
  it("prices a build in micro-USD at $3 in / $15 out per million tokens", () => {
    expect(costMicros(1_000_000, 0)).toBe(3_000_000);
    expect(costMicros(0, 1_000_000)).toBe(15_000_000);
    expect(costMicros(10_000, 4_000)).toBe(30_000 + 60_000);
  });
  it("treats missing token counts as zero", () => {
    expect(costMicros(null, null)).toBe(0);
  });
  it("formats micro-USD as dollars", () => {
    expect(formatUsd(10_000_000)).toBe("$10.00");
    expect(formatUsd(1_234_567)).toBe("$1.23");
    expect(formatUsd(20_000_000, 0)).toBe("$20");
  });
});

describe("slugs", () => {
  it("builds a url-safe slug with a random suffix", () => {
    const s = makeSlug("Checkout Flow — v2!");
    expect(s).toMatch(/^checkout-flow-v2-[a-z2-9]{4}$/);
  });
  it("falls back to 'prototype' for names with no letters", () => {
    expect(makeSlug("!!!")).toMatch(/^prototype-[a-z2-9]{4}$/);
  });
  it("never produces the same slug twice in a row", () => {
    const seen = new Set(Array.from({ length: 50 }, () => makeSlug("x")));
    expect(seen.size).toBeGreaterThan(45);
  });
});

describe("hosts", () => {
  it("reads the prototype slug from its subdomain", () => {
    expect(subdomainSlug("checkout-abcd.realframe.app")).toBe("checkout-abcd");
    expect(subdomainSlug("checkout-abcd.realframe.app:443")).toBe(
      "checkout-abcd",
    );
  });
  it("ignores reserved, nested and foreign hosts", () => {
    expect(subdomainSlug("www.realframe.app")).toBeNull();
    expect(subdomainSlug("api.realframe.app")).toBeNull();
    expect(subdomainSlug("a.b.realframe.app")).toBeNull();
    expect(subdomainSlug("realframe.app")).toBeNull();
    expect(subdomainSlug("evil.com")).toBeNull();
    expect(isReservedSlug("billing")).toBe(true);
  });
  it("shares cookies across subdomains only on the real domain", () => {
    expect(cookieDomain("www.realframe.app")).toBe(".realframe.app");
    expect(cookieDomain("localhost:3000")).toBeUndefined();
  });
  it("builds review URLs for production and local hosts", () => {
    expect(reviewUrlFor("demo-1234", "www.realframe.app")).toBe(
      "https://demo-1234.realframe.app",
    );
    expect(reviewUrlFor("demo-1234", "localhost:3000")).toBe(
      "http://localhost:3000/p/demo-1234",
    );
    expect(reviewUrlFor("demo-1234", "realframe-git-x.vercel.app")).toBe(
      "https://realframe-git-x.vercel.app/p/demo-1234",
    );
  });
});

describe("parsing the model's answer", () => {
  const doc = "<!doctype html><html><body>Hi</body></html>";
  it("reads the summary and document tags", () => {
    const r = parseResponse(
      `<summary>Made a page.</summary><document>${doc}</document>`,
    );
    expect(r).toEqual({ html: doc, summary: "Made a page." });
  });
  it("finds a bare document and strips code fences", () => {
    expect(parseResponse("```html\n" + doc + "\n```").html).toBe(doc);
  });
  it("rejects a truncated document", () => {
    expect(() => parseResponse("<document><html><body>")).toThrow(
      /complete HTML/,
    );
  });
});

describe("naming prototypes from prompts", () => {
  it("keeps short names as they are", () => {
    expect(nameFromPrompt("Checkout flow")).toEqual({
      name: "Checkout flow",
      isPrompt: false,
    });
  });
  it("trims a long description to its subject", () => {
    expect(
      nameFromPrompt(
        "I want a prototype for a mobile app for a content creator where they can schedule posts",
      ).name,
    ).toBe("Mobile app for a content creator");
  });
  it("has a sane prompt limit", () => {
    expect(MAX_PROMPT).toBe(10_000);
  });
});

describe("the pin agent", () => {
  it("puts the storage shim first in <head> and the agent before </body>", () => {
    const out = withAgent(
      "<html><head><title>x</title></head><body><p>a</p></body></html>",
    );
    expect(out.indexOf("<head><script>")).toBeGreaterThan(-1);
    expect(out.lastIndexOf("<script>")).toBeLessThan(out.indexOf("</body>"));
  });
  it("works on fragments with no head or body", () => {
    expect(withAgent("<p>a</p>")).toContain("<p>a</p>");
  });
});

describe("single-file import", () => {
  it("wraps an HTML fragment in a full document", () => {
    const r = importSingleFile("card.html", "<div>Card</div>");
    expect(r.html).toMatch(/^<!doctype html>/);
    expect(r.html).toContain("<div>Card</div>");
  });
  it("warns about local assets that weren't uploaded", () => {
    const r = importSingleFile(
      "page.html",
      '<html><body><img src="logo.png"></body></html>',
    );
    expect(r.warnings[0]).toMatch(/1 local file/);
  });
  it("detects React components", () => {
    expect(looksLikeReact("import x from 'react'; export default () => <div/>")).toBe(true);
    expect(looksLikeReact("<!doctype html><html></html>")).toBe(false);
  });
  it("refuses empty files", () => {
    expect(() => importSingleFile("a.html", "   ")).toThrow(/empty/);
  });
});

describe("guest cookies", () => {
  beforeAll(() => {
    process.env.SUPABASE_SECRET_KEY = "test-secret";
  });
  it("round-trips a signed guest name for one project only", async () => {
    const { signGuest, verifyGuest } = await import("@/lib/guest");
    const pid = "11111111-1111-1111-1111-111111111111";
    const v = signGuest(pid, "Maya");
    expect(verifyGuest(v, pid)).toEqual({ name: "Maya" });
    expect(verifyGuest(v, "22222222-2222-2222-2222-222222222222")).toBeNull();
  });
  it("rejects a tampered cookie", async () => {
    const { signGuest, verifyGuest } = await import("@/lib/guest");
    const pid = "11111111-1111-1111-1111-111111111111";
    const [a, b, , sig] = signGuest(pid, "Maya").split(".");
    const forged = [a, b, Buffer.from("Admin").toString("base64url"), sig].join(".");
    expect(verifyGuest(forged, pid)).toBeNull();
    expect(verifyGuest(undefined, pid)).toBeNull();
  });
});
