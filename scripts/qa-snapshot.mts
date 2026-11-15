// One-off: make a Vercel Sandbox snapshot with the browser for prototype checks installed,
// so each check starts in seconds instead of installing it first (~15 s).
//
//   vercel env pull .env.local   # or set VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID
//   npx tsx --env-file=.env.local scripts/qa-snapshot.mts
//
// Then set REALFRAME_QA_SNAPSHOT_ID to the printed id on the Vercel project. Re-run when
// QA_PACKAGES change (src/lib/qa/script.ts).
import { Sandbox } from "@vercel/sandbox";
import { QA_PACKAGES } from "../src/lib/qa/script";

const HOME = "/vercel/sandbox";
const sandbox = await Sandbox.create({
  image: "vercel/sandbox/node:22",
  resources: { vcpus: 2 },
  timeout: 10 * 60_000,
  tags: { app: "realframe", purpose: "qa-snapshot" },
});
console.log("Sandbox", sandbox.name);
await sandbox.writeFiles([
  {
    path: `${HOME}/qa/package.json`,
    content: JSON.stringify({ name: "rf-qa", private: true, type: "module" }),
  },
]);
const install = await sandbox.runCommand({
  cmd: "npm",
  args: ["install", "--no-audit", "--no-fund", "--loglevel=error", ...QA_PACKAGES],
  cwd: `${HOME}/qa`,
});
if (install.exitCode !== 0) {
  console.error(await install.stderr());
  await sandbox.stop();
  process.exit(1);
}
// Unpack the browser once, so it's in the snapshot too.
const probe = await sandbox.runCommand({
  cmd: "node",
  args: [
    "-e",
    "import('@sparticuz/chromium').then(async m => console.log(await m.default.executablePath()))",
  ],
  cwd: `${HOME}/qa`,
});
console.log("Browser at", (await probe.stdout()).trim());
const snapshot = await sandbox.snapshot({ expiration: 0 });
console.log(`REALFRAME_QA_SNAPSHOT_ID=${snapshot.snapshotId}`);
