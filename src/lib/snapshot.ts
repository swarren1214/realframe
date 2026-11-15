import { contentUrlFor } from "@/lib/content";
import { browser, privateHost } from "@/lib/headless";

/** Largest snapshot handed to the model, in characters. */
export const MAX_SNAPSHOT = 120_000;

// Runs inside the page. A plain string so no bundler helper gets compiled into it.
const SNAPSHOT_SCRIPT = `(function () {
  var used = [];
  function keep(rule) {
    if (rule instanceof CSSStyleRule) {
      try { return document.querySelector(rule.selectorText) ? rule.cssText : null; }
      catch (e) { return null; }
    }
    if (rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule) {
      var inner = Array.prototype.map.call(rule.cssRules, keep).filter(Boolean).join("\\n");
      if (!inner) return null;
      var at = rule instanceof CSSMediaRule ? "media " : "supports ";
      return "@" + at + rule.conditionText + " {\\n" + inner + "\\n}";
    }
    // Fonts, keyframes, custom properties on :root and the like are kept whole.
    return rule.cssText;
  }
  Array.prototype.forEach.call(document.styleSheets, function (sheet) {
    var rules;
    try { rules = sheet.cssRules; }
    catch (e) { if (sheet.href) used.push('@import url("' + sheet.href + '");'); return; }
    Array.prototype.forEach.call(rules, function (r) { var t = keep(r); if (t) used.push(t); });
  });
  var body = document.body.cloneNode(true);
  body.querySelectorAll("script, noscript, template").forEach(function (n) { n.remove(); });
  var title = (document.title || "Prototype").replace(/</g, "&lt;");
  var base = /^https?:/.test(location.protocol) ? '<base href="' + location.origin + '/">\\n' : "";
  return "<!DOCTYPE html>\\n<html lang=\\"" + (document.documentElement.lang || "en") + "\\">\\n<head>\\n<meta charset=\\"utf-8\\">\\n" +
    "<meta name=\\"viewport\\" content=\\"width=device-width, initial-scale=1\\">\\n<title>" + title + "</title>\\n" + base +
    "<style>\\n" + used.join("\\n") + "\\n</style>\\n</head>\\n" + body.outerHTML + "\\n</html>";
})()`;

/**
 * Renders an imported app (a bundle version) in headless Chromium and returns the
 * page as it looks: its markup, plus only the CSS rules that match something on
 * the page, with scripts removed. This is what an AI copy is rebuilt from.
 */
export async function snapshotBundle(
  versionId: string,
  size = { width: 1280, height: 800 },
) {
  return snapshotUrl(contentUrlFor(versionId), size);
}

export async function snapshotUrl(
  url: string,
  size = { width: 1280, height: 800 },
): Promise<{ html: string; truncated: boolean }> {
  const b = await browser();
  try {
    const page = await b.newPage();
    await page.setViewport(size);
    await page.setRequestInterception(true);
    page.on("request", (r) =>
      privateHost(r.url()) ? r.abort() : r.continue(),
    );
    await page.evaluateOnNewDocument(() => {
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => null;
    });
    await page
      .goto(url, {
        waitUntil: "networkidle2",
        timeout: 25_000,
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));

    const html = (await page.evaluate(SNAPSHOT_SCRIPT)) as string;
    return html.length > MAX_SNAPSHOT
      ? { html: html.slice(0, MAX_SNAPSHOT), truncated: true }
      : { html, truncated: false };
  } finally {
    await b.close();
  }
}
