import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL: run against a deployment (e.g. a Vercel preview). Without it, tests start the
// production build locally on port 3100 (run `npm run build` first).
// PLAYWRIGHT_CHROME: path to a Chrome binary, for machines where `playwright install` can't run.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const chrome = process.env.PLAYWRIGHT_CHROME;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: chrome ? { executablePath: chrome } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /marketing\.spec/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next start -p 3100",
        url: "http://localhost:3100",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
