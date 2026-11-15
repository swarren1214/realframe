// Flow map: crawling a prototype's screens and drawing arrows between canvas frames.
import { describe, expect, it } from "vitest";
import {
  arrowPath,
  crawl,
  isRouteLink,
  layoutFlow,
  normalizeRoute,
  routesInSource,
  screenName,
  type ScreenReport,
} from "@/lib/flow";

/** A fake prototype: route → links on that screen. Unknown routes fall back to home. */
function app(
  screens: Record<string, string[]>,
  start = "#/home",
  redirects: Record<string, string> = {},
) {
  let at = start;
  return async (route: string | null): Promise<ScreenReport> => {
    if (route !== null) at = redirects[route] ?? (route in screens ? route : at);
    return {
      hash: at,
      title: at,
      sig: `sig:${at}`,
      links: (screens[at] ?? []).map((h) => ({ hash: h, text: h.slice(2) })),
    };
  };
}

describe("normalizeRoute", () => {
  it("treats empty, # and #/ as the first screen", () => {
    expect(normalizeRoute("")).toBe("");
    expect(normalizeRoute("#")).toBe("");
    expect(normalizeRoute("#/")).toBe("");
  });
  it("drops a trailing slash", () => {
    expect(normalizeRoute("#/library/")).toBe("#/library");
  });
});

describe("screenName", () => {
  it("names a screen from its route", () => {
    expect(screenName("#/scripts/new-draft")).toBe("Scripts / New Draft");
    expect(screenName("")).toBe("Home");
  });
});

describe("isRouteLink", () => {
  it("follows hash routes but not bare #", () => {
    expect(isRouteLink("#/stats")).toBe(true);
    expect(isRouteLink("#settings")).toBe(true);
    expect(isRouteLink("#")).toBe(false);
    expect(isRouteLink("https://x.com")).toBe(false);
  });
});

describe("routesInSource", () => {
  it("finds literal hash routes in script and markup", () => {
    const html = `<a href="#/home">H</a><script>go('#/stats'); x = \`#/ideas\`; y = "#/home"</script>`;
    expect(routesInSource(html).sort()).toEqual(["#/home", "#/ideas", "#/stats"]);
  });
});

describe("crawl", () => {
  it("walks breadth-first and records each link once", async () => {
    const result = await crawl(
      app({
        "#/home": ["#/library", "#/scripts", "#/home"],
        "#/library": ["#/home", "#/item"],
        "#/scripts": ["#/home"],
        "#/item": ["#/library"],
      }),
    );
    expect(result.screens.map((s) => [s.route, s.depth])).toEqual([
      ["#/home", 0],
      ["#/library", 1],
      ["#/scripts", 1],
      ["#/item", 2],
    ]);
    expect(result.links).toContainEqual({
      from: "#/home",
      to: "#/library",
      label: "library",
    });
    // No self links.
    expect(result.links.some((l) => l.from === l.to)).toBe(false);
    expect(result.links).toHaveLength(6);
  });

  it("adds screens only reachable from script, after the rest", async () => {
    const result = await crawl(
      app({ "#/home": ["#/a"], "#/a": [], "#/hidden": [] }),
      { seeds: ["#/hidden"] },
    );
    expect(result.screens.map((s) => s.route)).toEqual([
      "#/home",
      "#/a",
      "#/hidden",
    ]);
    expect(result.screens[2].depth).toBe(2);
  });

  it("drops routes the app ignores or redirects", async () => {
    const result = await crawl(
      app({ "#/home": ["#/ghost", "#/old"], "#/new": [] }, "#/home", {
        "#/old": "#/new",
      }),
    );
    expect(result.screens.map((s) => s.route)).toEqual(["#/home", "#/new"]);
    expect(result.links).toEqual([]);
  });

  it("stops at the screen limit and when cancelled", async () => {
    const many = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`#/s${i}`, [`#/s${i + 1}`]]),
    );
    const capped = await crawl(app(many, "#/s0"), { max: 5 });
    expect(capped.screens).toHaveLength(5);
    let n = 0;
    const stopped = await crawl(app(many, "#/s0"), {
      cancelled: () => ++n > 3,
    });
    expect(stopped.screens.length).toBeLessThan(5);
  });
});

describe("layoutFlow", () => {
  it("puts each depth in its own column", () => {
    const spots = layoutFlow(
      [
        { route: "", depth: 0 },
        { route: "#/a", depth: 1 },
        { route: "#/b", depth: 1 },
      ],
      { width: 390, height: 844 },
      { x: 100, y: 0 },
      { x: 200, y: 100 },
    );
    expect(spots.get("")).toEqual({ x: 100, y: 0 });
    expect(spots.get("#/a")).toEqual({ x: 690, y: 0 });
    expect(spots.get("#/b")).toEqual({ x: 690, y: 944 });
  });
});

describe("arrowPath", () => {
  const a = { x: 0, y: 0, w: 100, h: 200 };
  it("goes from the right side to the left side of a frame to the right", () => {
    const p = arrowPath(a, { x: 300, y: 0, w: 100, h: 200 });
    expect(p.d.startsWith("M 100 100")).toBe(true);
    expect(p.tip).toEqual({ x: 300, y: 100 });
    expect(p.end).toBe("left");
  });
  it("goes back leftward for a frame to the left", () => {
    const p = arrowPath({ x: 300, y: 0, w: 100, h: 200 }, a);
    expect(p.end).toBe("right");
    expect(p.tip).toEqual({ x: 100, y: 100 });
  });
  it("goes down for a frame below", () => {
    const p = arrowPath(a, { x: 0, y: 400, w: 100, h: 200 });
    expect(p.end).toBe("top");
  });
  it("spreads arrows that share a side", () => {
    const b = { x: 300, y: 0, w: 100, h: 300 };
    const first = arrowPath(a, b, { slot: 0, slots: 2 });
    const second = arrowPath(a, b, { slot: 1, slots: 2 });
    expect(first.d).not.toBe(second.d);
  });
});

describe("collapseNav", () => {
  it("keeps tab-bar links only from the first screen", async () => {
    const tabs = ["#/home", "#/library", "#/scripts", "#/stats"];
    const result = await crawl(
      app({
        "#/home": [...tabs, "#/detail"],
        "#/library": tabs,
        "#/scripts": tabs,
        "#/stats": tabs,
        "#/detail": [...tabs, "#/library"],
      }),
    );
    const fromTabs = result.links.filter((l) => l.from !== "#/home");
    // Library is reached from everywhere: drawn only from home.
    expect(fromTabs.some((l) => l.to === "#/library")).toBe(false);
    expect(result.links).toContainEqual({ from: "#/home", to: "#/detail", label: "detail" });
    // Home itself is linked from every tab, which is nav too.
    expect(result.links.some((l) => l.to === "#/home")).toBe(false);
  });
});
