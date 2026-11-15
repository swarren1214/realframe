// The browser check that runs inside a Vercel Sandbox. It loads the prototype exactly as the
// Studio shows it (a sandboxed srcdoc frame, phone-sized), visits every screen, taps every
// control, and prints a JSON report between markers. Kept as a string so it ships with the
// server bundle; tests run it against a local Chrome with CHROME_PATH.
//
// Inputs: argv[2] = the prepared document (see prepareDocument). Env: QA_BUDGET_MS.

export const QA_PACKAGES = ["puppeteer-core@25.17.0", "@sparticuz/chromium@153.0.0"];
export const REPORT_START = "<<<RF_QA_REPORT>>>";
export const REPORT_END = "<<<RF_QA_END>>>";

/** Runs first in the prototype: records errors and failed loads for the check. */
export const QA_PROBE = `(function(){
  var q = window.__qa = { errors: [] };
  function rec(m){ if (q.errors.length < 40) q.errors.push(String(m).slice(0, 300)); }
  window.addEventListener('error', function(e){
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) rec('Failed to load ' + (t.src || t.href));
    else rec((e.message || 'Script error') + (e.lineno ? ' (line ' + e.lineno + ')' : ''));
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e.reason; rec('Unhandled promise rejection: ' + ((r && r.message) || r));
  });
  var ce = console.error;
  console.error = function(){ rec('console.error: ' + [].map.call(arguments, String).join(' ')); return ce.apply(console, arguments); };
})();`;

export const QA_SCRIPT = String.raw`
import fs from "node:fs";
import http from "node:http";
import puppeteer from "puppeteer-core";

const START = "${REPORT_START}", END = "${REPORT_END}";
const doc = fs.readFileSync(process.argv[2], "utf8");
const budget = Number(process.env.QA_BUDGET_MS || 90000);
const began = Date.now();
const left = () => budget - (Date.now() - began);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const parent = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe id="f" sandbox="allow-scripts allow-forms allow-popups allow-modals"></iframe><script>window.load=function(){return fetch("/doc").then(function(r){return r.text()}).then(function(t){document.getElementById("f").srcdoc=t})};load()</script></body></html>';
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  if (req.url === "/doc") return res.end(doc);
  if (req.url === "/") return res.end(parent);
  res.statusCode = 404; res.end("not found");
}).listen(0);
const origin = "http://127.0.0.1:" + server.address().port;

let executablePath = process.env.CHROME_PATH, args = ["--no-sandbox"];
if (!executablePath) {
  const chromium = (await import("@sparticuz/chromium")).default;
  executablePath = await chromium.executablePath();
  args = chromium.args;
}
const browser = await puppeteer.launch({
  executablePath, args, headless: true,
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const dialogs = [];
page.on("dialog", (d) => { dialogs.push(d.message().slice(0, 120)); d.dismiss().catch(() => {}); });
browser.on("targetcreated", async (t) => { if (t.type() === "page") { const p = await t.page().catch(() => null); if (p && p !== page) p.close().catch(() => {}); } });

const issues = [];
const seen = new Set();
function issue(severity, kind, where, detail) {
  // The same error from different places is one problem; report it where it first showed.
  const key = kind === "error" ? "error|" + detail.replace(/^Tapping it throws: /, "") : kind + "|" + where + "|" + detail;
  if (seen.has(key) || issues.length >= 40) return;
  seen.add(key); issues.push({ severity, kind, where, detail });
}

const frame = () => page.frames().find((f) => f !== page.mainFrame());
async function fresh(hash) {
  if (page.url() === "about:blank") await page.goto(origin + "/", { waitUntil: "load" });
  else await page.evaluate(() => window.load());
  const t0 = Date.now();
  for (;;) {
    const f = frame();
    const ok = f && (await f.evaluate(() => document.readyState === "complete" && !!window.__qa).catch(() => false));
    if (ok) break;
    if (Date.now() - t0 > 15000) throw new Error("The prototype didn't finish loading in 15 seconds.");
    await sleep(100);
  }
  await sleep(900);
  if (hash) { await frame().evaluate((h) => { location.hash = h; }, hash).catch(() => {}); await sleep(500); }
}

const MEASURE = () => {
  const b = document.body;
  const text = (b ? b.innerText : "").replace(/\s+/g, " ").trim();
  let media = 0;
  for (const el of document.querySelectorAll("img,svg,canvas,video,iframe")) {
    const r = el.getBoundingClientRect();
    if (r.width > 24 && r.height > 24) media++;
  }
  const overlay = [...document.querySelectorAll("[role=dialog],dialog[open],[aria-modal=true]")].length;
  return {
    url: location.href, hash: location.hash, textLen: text.length,
    blank: text.length < 15 && media === 0,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 4,
    sig: text.length + ":" + document.querySelectorAll("*").length + ":" + overlay + ":" + text.slice(0, 400),
    errors: window.__qa ? window.__qa.errors.slice() : [],
  };
};
const TARGETS = () => {
  const sel = "a[href],button,[role=button],[role=tab],[role=link],[role=menuitem],[onclick],summary,input[type=checkbox],input[type=radio],label[for]";
  const path = (el) => {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body) {
      let i = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) i++;
      parts.unshift(el.tagName.toLowerCase() + ":nth-of-type(" + i + ")");
      el = el.parentElement;
    }
    return "body > " + parts.join(" > ");
  };
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (r.width < 4 || r.height < 4 || cs.visibility === "hidden" || cs.display === "none" || el.disabled) continue;
    if (el.closest("[aria-hidden=true]")) continue;
    const href = el.getAttribute("href");
    if (el.tagName === "A" && href && /^(https?:|mailto:|tel:|sms:)/i.test(href)) continue;
    const label = (el.getAttribute("aria-label") || el.innerText || el.value || href || el.tagName).replace(/\s+/g, " ").trim().slice(0, 60);
    out.push({ path: path(el), label, tag: el.tagName.toLowerCase(), href });
  }
  return out;
};

const report = { ok: true, screens: [], tested: 0, issues };
try {
  await fresh(null);
  const first = await frame().evaluate(MEASURE);
  for (const e of first.errors) issue("major", "error", "on load", e);
  if (first.blank) issue("major", "blank", "on load", "The first screen is blank.");
  report.screens.push(first.hash || "(start)");

  // Every screen reachable by a hash link.
  const start = await frame().evaluate(TARGETS);
  const routes = [...new Set(start.map((t) => t.href).filter((h) => h && /^#./.test(h)))].slice(0, 10);
  const byRoute = new Map([["", start]]);
  for (const r of routes) {
    if (left() < 20000) break;
    await frame().evaluate((h) => { location.hash = h; }, r).catch(() => {});
    await sleep(600);
    const f = frame();
    const m = await f.evaluate(MEASURE).catch(() => null);
    if (!m || !m.url.startsWith("about:srcdoc")) { issue("major", "navigation", r, "Opening this screen leaves the prototype."); await fresh(null); continue; }
    report.screens.push(r);
    if (m.blank) issue("major", "blank", r, "This screen is blank.");
    if (m.overflowX) issue("minor", "layout", r, "The screen scrolls sideways on a phone (content is wider than 390px).");
    byRoute.set(r, await f.evaluate(TARGETS));
  }
  if (first.overflowX) issue("minor", "layout", "start screen", "The screen scrolls sideways on a phone (content is wider than 390px).");
  const errorsSoFar = (await frame().evaluate(MEASURE).catch(() => ({ errors: [] }))).errors;
  for (const e of errorsSoFar) issue("major", "error", "while switching screens", e);

  // Tap every control, once per distinct control, each from a clean start on its screen.
  const tests = [];
  const done = new Set();
  for (const [route, list] of byRoute) for (const t of list) {
    // A control shared by every screen (a tab bar) is tested once.
    const key = (t.href && /^#./.test(t.href)) ? "href:" + t.href : t.path + "|" + t.label;
    if (done.has(key)) continue;
    done.add(key); tests.push({ route, ...t });
  }
  let dirty = true;
  for (const t of tests.slice(0, 45)) {
    if (left() < 8000) break;
    if (dirty) await fresh(t.route || null);
    let f = frame();
    const before = await f.evaluate(MEASURE).catch(() => null);
    const handle = await f.$(t.path).catch(() => null);
    if (!before || !handle) { dirty = true; continue; }
    const where = (t.route ? t.route + ": " : "") + '"' + t.label + '" (' + t.tag + ")";
    const nDialogs = dialogs.length;
    try { await handle.click({ delay: 20 }); } catch { await handle.evaluate((el) => el.click()).catch(() => {}); }
    await sleep(700);
    report.tested++;
    f = frame();
    const after = await f.evaluate(MEASURE).catch(() => null);
    if (!after || !after.url.startsWith("about:srcdoc")) {
      issue("major", "navigation", where, "Tapping it leaves the prototype" + (after ? " (goes to " + after.url.slice(0, 80) + ")" : "") + ", so the screen goes blank.");
      dirty = true; continue;
    }
    const newErrors = after.errors.slice(before.errors.length);
    for (const e of newErrors) issue("major", "error", where, "Tapping it throws: " + e);
    if (after.blank && !before.blank) issue("major", "blank", where, "Tapping it leaves a blank screen.");
    const changed = after.sig !== before.sig || after.hash !== before.hash || dialogs.length > nDialogs;
    if (!changed && !/^(input)$/.test(t.tag)) issue("minor", "dead", where, "Tapping it does nothing visible.");
    dirty = changed || newErrors.length > 0;
  }
} catch (err) {
  report.ok = false;
  report.error = String(err && err.message || err).slice(0, 300);
}
report.ms = Date.now() - began;
console.log(START + JSON.stringify(report) + END);
await browser.close().catch(() => {});
server.close();
process.exit(0);
`;
