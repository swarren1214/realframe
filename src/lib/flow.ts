/**
 * Flow map: turns a crawl of a prototype's screens (hash routes) and the links between them
 * into canvas frame positions and arrow paths. Pure functions, no DOM.
 */

export type FlowLink = { from: string; to: string; label: string };

export type ScreenReport = {
  /** The screen's hash after navigating there (an app may redirect). */
  hash: string;
  title: string;
  /** Fingerprint of the screen's text: a route that renders the same thing isn't a new screen. */
  sig?: string;
  links: { hash: string; text: string }[];
};

/** "", "#" and "#/" are all the first screen; trailing slashes don't make a new screen. */
export function normalizeRoute(hash: string): string {
  let h = (hash ?? "").trim();
  if (h === "#" || h === "#/" || h === "#!" || h === "#!/") return "";
  if (h.length > 2 && h.endsWith("/")) h = h.slice(0, -1);
  return h.slice(0, 200);
}

/** A readable frame name for a route: "#/scripts/new" → "Scripts / New". */
export function screenName(route: string, fallback = "Home"): string {
  const parts = normalizeRoute(route)
    .replace(/^#!?\/?/, "")
    .split(/[/?]/)
    .filter(Boolean)
    .slice(0, 3);
  if (parts.length === 0) return fallback;
  return parts
    .map((p) =>
      decodeURIComponentSafe(p)
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    )
    .join(" / ")
    .slice(0, 80);
}

function decodeURIComponentSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Hash routes written literally in the prototype's source ("#/library", '#/stats'). Seeds the
 * crawl with screens that are only reached from script, so they still show up on the map.
 */
export function routesInSource(html: string, limit = 40): string[] {
  const out = new Set<string>();
  const re = /["'`](#!?\/[A-Za-z0-9_\-/.]*)["'`?]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.size < limit) {
    const r = normalizeRoute(m[1]);
    if (r) out.add(r);
  }
  return [...out];
}

/** A link worth following: a hash route, not an in-page anchor or a bare "#". */
export function isRouteLink(hash: string): boolean {
  const h = hash.trim();
  if (!h.startsWith("#") || h === "#") return false;
  return /^#!?\//.test(h) || /^#[A-Za-z][\w-]*$/.test(h);
}

export type Crawl = {
  /** Screens in discovery order; the first is where the prototype starts. */
  screens: { route: string; title: string; depth: number }[];
  links: FlowLink[];
};

/**
 * Breadth-first crawl. `visit` navigates the prototype to a route ("" = as loaded) and reports
 * the screen it landed on. Screens found only in the source are visited last.
 */
export async function crawl(
  visit: (route: string | null) => Promise<ScreenReport>,
  opts: {
    seeds?: string[];
    max?: number;
    onProgress?: (found: number) => void;
    cancelled?: () => boolean;
  } = {},
): Promise<Crawl> {
  const max = opts.max ?? 30;
  const screens: Crawl["screens"] = [];
  const known = new Map<string, number>(); // route → index in screens
  const sigs = new Map<string, string>(); // content fingerprint → route
  const links = new Map<string, FlowLink>();
  const alias = new Map<string, string>(); // route that showed an existing screen → that screen
  const queue: { route: string | null; depth: number }[] = [
    { route: null, depth: 0 },
  ];
  const queued = new Set<string>();
  const seeds = [...(opts.seeds ?? [])];
  let seeded = false;

  while (screens.length < max && !opts.cancelled?.()) {
    let next = queue.shift();
    if (!next) {
      if (seeded) break;
      seeded = true;
      const deepest = screens.reduce((d, s) => Math.max(d, s.depth), 0);
      for (const r of seeds)
        if (!known.has(r) && !queued.has(r)) {
          queued.add(r);
          queue.push({ route: r, depth: deepest + 1 });
        }
      continue;
    }
    let report: ScreenReport;
    try {
      report = await visit(next.route);
    } catch {
      continue;
    }
    let here = normalizeRoute(report.hash);
    // A route the app ignores shows the same screen as one we have: not a screen of its own.
    const same = report.sig ? sigs.get(report.sig) : undefined;
    if (!known.has(here) && same !== undefined && next.route !== null) {
      alias.set(here, same);
      continue;
    }
    if (report.sig && !sigs.has(report.sig)) sigs.set(report.sig, here);
    if (alias.has(here)) here = alias.get(here)!;
    if (!known.has(here)) {
      known.set(here, screens.length);
      screens.push({ route: here, title: report.title, depth: next.depth });
      opts.onProgress?.(screens.length);
    } else if (next.route !== null) {
      // Asked for one route, landed on a screen we already have: a redirect. Nothing new here.
      continue;
    }
    const depth = screens[known.get(here)!].depth;
    for (const l of report.links) {
      if (!isRouteLink(l.hash)) continue;
      const to = normalizeRoute(l.hash);
      if (to === here) continue;
      const key = `${here}\u0000${to}`;
      if (!links.has(key))
        links.set(key, { from: here, to, label: l.text.slice(0, 40) });
      if (!known.has(to) && !queued.has(to)) {
        queued.add(to);
        queue.push({ route: to, depth: depth + 1 });
      }
    }
  }

  // Links to screens that redirected elsewhere or weren't reached point nowhere: drop them.
  const reached = new Set(screens.map((s) => s.route));
  const merged = new Map<string, FlowLink>();
  for (const l of links.values()) {
    const to = alias.get(l.to) ?? l.to;
    const key = `${l.from}\u0000${to}`;
    if (to !== l.from && reached.has(l.from) && reached.has(to) && !merged.has(key))
      merged.set(key, { ...l, to });
  }
  return { screens, links: collapseNav(screens, [...merged.values()]) };
}

/**
 * A tab bar or menu links every screen to every tab, which turns the map into a mesh. A link to
 * a screen that shows up on most screens is navigation: keep it only from the first screen.
 */
export function collapseNav(
  screens: { route: string }[],
  links: FlowLink[],
): FlowLink[] {
  if (screens.length < 4) return links;
  const root = screens[0].route;
  const from = new Map<string, Set<string>>();
  for (const l of links) {
    const set = from.get(l.to) ?? new Set<string>();
    set.add(l.from);
    from.set(l.to, set);
  }
  // Screens that could link to `to`: every screen but itself.
  const nav = (to: string) =>
    (from.get(to)?.size ?? 0) >=
    Math.max(3, Math.ceil((screens.length - 1) * 0.6));
  return links.filter((l) => !nav(l.to) || l.from === root);
}

/** Frame positions: one column per click-depth, screens stacked in discovery order. */
export function layoutFlow(
  screens: { route: string; depth: number }[],
  size: { width: number; height: number },
  origin: { x: number; y: number },
  gap = { x: 280, y: 160 },
): Map<string, { x: number; y: number }> {
  const rows = new Map<number, number>();
  const out = new Map<string, { x: number; y: number }>();
  for (const s of screens) {
    const row = rows.get(s.depth) ?? 0;
    rows.set(s.depth, row + 1);
    out.set(s.route, {
      x: origin.x + s.depth * (size.width + gap.x),
      y: origin.y + row * (size.height + gap.y),
    });
  }
  return out;
}

export type Box = { x: number; y: number; w: number; h: number };
export type Side = "left" | "right" | "top" | "bottom";

/**
 * An arrow between two frames as an SVG cubic path, leaving the side of `a` that faces `b`.
 * `slot`/`slots` spread several arrows along the same side so they don't stack.
 */
export function arrowPath(
  a: Box,
  b: Box,
  out: { slot: number; slots: number } = { slot: 0, slots: 1 },
  into: { slot: number; slots: number } = { slot: 0, slots: 1 },
): {
  d: string;
  mid: { x: number; y: number };
  tip: { x: number; y: number };
  end: Side;
} {
  let from: Side, to: Side;
  if (b.x >= a.x + a.w) [from, to] = ["right", "left"];
  else if (b.x + b.w <= a.x) [from, to] = ["left", "right"];
  else if (b.y >= a.y + a.h) [from, to] = ["bottom", "top"];
  else [from, to] = ["top", "bottom"];

  const p = anchor(a, from, out.slot, out.slots);
  const q = anchor(b, to, into.slot, into.slots);
  const dist = Math.hypot(q.x - p.x, q.y - p.y);
  const pull = Math.max(80, dist * 0.4);
  const c1 = push(p, from, pull);
  const c2 = push(q, to, pull);
  const d = `M ${p.x} ${p.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${q.x} ${q.y}`;
  // The point halfway along the curve (t = 0.5), for the label.
  const mid = {
    x: (p.x + 3 * c1.x + 3 * c2.x + q.x) / 8,
    y: (p.y + 3 * c1.y + 3 * c2.y + q.y) / 8,
  };
  return { d, mid, tip: q, end: to };
}

function anchor(b: Box, side: Side, slot: number, slots: number) {
  const f = (slot + 1) / (slots + 1);
  if (side === "left") return { x: b.x, y: b.y + b.h * f };
  if (side === "right") return { x: b.x + b.w, y: b.y + b.h * f };
  if (side === "top") return { x: b.x + b.w * f, y: b.y };
  return { x: b.x + b.w * f, y: b.y + b.h };
}

function push(p: { x: number; y: number }, side: Side, by: number) {
  if (side === "left") return { x: p.x - by, y: p.y };
  if (side === "right") return { x: p.x + by, y: p.y };
  if (side === "top") return { x: p.x, y: p.y - by };
  return { x: p.x, y: p.y + by };
}
