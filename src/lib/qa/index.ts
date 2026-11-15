import "server-only";
import { Sandbox } from "@vercel/sandbox";
import { withAgent } from "@/lib/agent";
import {
  QA_PACKAGES,
  QA_PROBE,
  QA_SCRIPT,
  REPORT_END,
  REPORT_START,
} from "./script";

/**
 * Checks a prototype the way a person would: in a real browser (Chromium in a Vercel
 * Sandbox, so the prototype's code never runs on our servers), phone-sized, shown exactly as
 * the Studio shows it. Every screen is visited and every control tapped; errors, blank
 * screens, links that leave the prototype, controls that do nothing and sideways scrolling are
 * reported, and the build's last step asks the model to fix them.
 */

export type QaIssue = {
  severity: "major" | "minor";
  kind: "error" | "blank" | "navigation" | "dead" | "layout";
  where: string;
  detail: string;
};

export type QaReport = {
  ok: boolean;
  error?: string;
  screens: string[];
  tested: number;
  issues: QaIssue[];
  ms?: number;
};

const HOME = "/vercel/sandbox";

/** Checks are on unless REALFRAME_QA is "off". */
export function qaEnabled() {
  return process.env.REALFRAME_QA !== "off";
}

/**
 * The document as the Studio shows it, plus the probe that records errors. The probe goes in
 * first; withAgent then puts Realframe's base and shims ahead of it, so the order in <head> is:
 * base, Realframe's scripts, the probe, the prototype's own code.
 */
export function prepareDocument(html: string) {
  const probe = `<script>${QA_PROBE}</script>`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  const withProbe = head
    ? html.slice(0, head.index + head[0].length) +
      probe +
      html.slice(head.index + head[0].length)
    : probe + html;
  return withAgent(withProbe, { srcdoc: true });
}

/** Parse the report the script printed. */
export function readReport(stdout: string): QaReport | null {
  const a = stdout.lastIndexOf(REPORT_START);
  const b = stdout.lastIndexOf(REPORT_END);
  if (a < 0 || b < a) return null;
  try {
    return JSON.parse(stdout.slice(a + REPORT_START.length, b)) as QaReport;
  } catch {
    return null;
  }
}

/**
 * Run the checks in a fresh sandbox. With REALFRAME_QA_SNAPSHOT_ID set, the sandbox starts from
 * a snapshot that already has the browser installed; otherwise it's installed first (~15 s).
 * Throws if the sandbox can't run; the caller keeps the build either way.
 */
export async function runQaChecks(
  html: string,
  opts: { budgetMs: number; signal?: AbortSignal },
): Promise<QaReport> {
  const snapshotId = process.env.REALFRAME_QA_SNAPSHOT_ID;
  const base = {
    resources: { vcpus: 2 },
    timeout: Math.max(opts.budgetMs + 60_000, 120_000),
    tags: { app: "realframe", purpose: "qa" },
  } as const;
  const sandbox = snapshotId
    ? await Sandbox.create({
        ...base,
        source: { type: "snapshot", snapshotId },
      })
    : await Sandbox.create({ ...base, image: "vercel/sandbox/node:22" });
  try {
    if (!snapshotId) await installBrowser(sandbox, opts.signal);
    await sandbox.writeFiles(
      [
        { path: `${HOME}/qa/check.mjs`, content: QA_SCRIPT },
        { path: `${HOME}/qa/doc.html`, content: prepareDocument(html) },
      ],
      { signal: opts.signal },
    );
    const run = await sandbox.runCommand({
      cmd: "node",
      args: ["check.mjs", "doc.html"],
      cwd: `${HOME}/qa`,
      env: { QA_BUDGET_MS: String(opts.budgetMs), NODE_PATH: `${HOME}/qa/node_modules` },
      signal: opts.signal,
    });
    const stdout = await run.stdout();
    const report = readReport(stdout);
    if (!report) {
      const stderr = (await run.stderr()).slice(-400);
      throw new Error(`The check didn't report (exit ${run.exitCode}). ${stderr}`);
    }
    return report;
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

/** Installs the browser packages into the sandbox's qa folder. */
export async function installBrowser(sandbox: Sandbox, signal?: AbortSignal) {
  await sandbox.writeFiles(
    [
      {
        path: `${HOME}/qa/package.json`,
        content: JSON.stringify({ name: "rf-qa", private: true, type: "module" }),
      },
    ],
    { signal },
  );
  const install = await sandbox.runCommand({
    cmd: "npm",
    args: ["install", "--no-audit", "--no-fund", "--loglevel=error", ...QA_PACKAGES],
    cwd: `${HOME}/qa`,
    signal,
  });
  if (install.exitCode !== 0)
    throw new Error(
      `Couldn't install the browser for checks: ${(await install.stderr()).slice(-300)}`,
    );
}

/** Whether a report has anything worth a fix pass. */
export function needsFix(report: QaReport) {
  return report.issues.some((i) => i.severity === "major") ||
    report.issues.filter((i) => i.kind === "dead").length > 0 ||
    report.issues.some((i) => i.kind === "layout");
}

/** The builder's instruction for fixing what the checks found. */
export function fixPrompt(request: string, report: QaReport) {
  const lines = report.issues
    .slice(0, 30)
    .map((i) => `- [${i.severity}] ${i.where}: ${i.detail}`)
    .join("\n");
  return `The user asked for:
<request>
${request}
</request>

That has been built. An automated check then opened it on a phone-sized screen, visited ${report.screens.length} screen${report.screens.length === 1 ? "" : "s"} and tapped ${report.tested} control${report.tested === 1 ? "" : "s"}. It found these problems:
<issues>
${lines}
</issues>

Fix them in the current document:
- Fix every error and blank screen at its cause. A blank screen after switching screens usually means the screen's render code threw, or the router has no view for that route.
- Links must keep the person inside the prototype. Navigate between screens with in-page state or #/hash routes, never real page URLs.
- A control that "does nothing visible" should do what its label says, using the prototype's own mock data and state (open a sheet, add an item, filter a list, switch a tab, show a confirmation). If it's purely decorative, make it look non-interactive instead.
- Content wider than the phone should wrap or scroll inside its own container, not make the page scroll sideways.
Keep everything else the same: the design, the screens, the copy and the data. Don't add features beyond what's needed to fix these.`;
}

/** One line for the chat about what the checks did. */
export function qaSummary(report: QaReport, fixed: boolean) {
  const scope = `Checked ${report.screens.length} screen${report.screens.length === 1 ? "" : "s"} and ${report.tested} tap${report.tested === 1 ? "" : "s"}`;
  const majors = report.issues.filter((i) => i.severity === "major").length;
  const minors = report.issues.length - majors;
  if (!report.issues.length) return `${scope}: no problems found.`;
  const found = [
    majors ? `${majors} problem${majors === 1 ? "" : "s"}` : "",
    minors ? `${minors} smaller issue${minors === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  return fixed
    ? `${scope}: found ${found} and fixed ${report.issues.length === 1 ? "it" : "them"}.`
    : `${scope}: found ${found}.`;
}
