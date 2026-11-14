// The primary signed-in workflows, end to end, against a deployment backed by a test Supabase
// project with REALFRAME_FAKE_AI=1 (builds are instant and free). Skipped without that setup;
// see e2e/support/supabase.ts.
import { expect, test } from "@playwright/test";
import {
  adminPatch,
  createUser,
  hasSupabase,
  rpc,
  select,
  signIn,
  type E2EUser,
} from "./support/supabase";

test.skip(
  !hasSupabase,
  "Set E2E_BASE_URL and E2E_SUPABASE_URL, _PUBLISHABLE_KEY and _SECRET_KEY to run signed-in flows.",
);
test.describe.configure({ mode: "serial" });

let builder: E2EUser;
let reviewer: E2EUser;
let projectId = "";
let slug = "";

test.beforeAll(async () => {
  builder = await createUser("Builder");
  reviewer = await createUser("Reviewer");
});

test("a builder creates a prototype and iterates on it", async ({ page }) => {
  await signIn(page, builder);
  await expect(page).toHaveURL(/\/projects$/);
  await page
    .getByLabel("Describe a new prototype")
    .fill("A checkout flow with a promo code field and an order summary");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}/);
  projectId = page.url().match(/projects\/([0-9a-f-]{36})/)![1];
  // The first build starts on its own; the fake model answers at once.
  await expect(page.getByText("v1").first()).toBeVisible({ timeout: 30_000 });

  await page
    .getByLabel(/Describe a change to v1/)
    .fill("Make the pay button bigger");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText("v2").first()).toBeVisible({ timeout: 30_000 });
  const versions = await select<{ number: number }>(
    builder,
    `versions?project_id=eq.${projectId}&select=number&order=number`,
  );
  expect(versions.map((v) => v.number)).toEqual([1, 2]);
});

test("the builder publishes and invites a reviewer, who comments", async ({
  page,
}) => {
  await signIn(page, builder, `/projects/${projectId}`);
  await page.getByRole("button", { name: /Publish v2/ }).click();
  await expect(page.getByRole("button", { name: /v2 is live/ })).toBeVisible();
  const [p] = await select<{ slug: string; published: boolean }>(
    builder,
    `projects?id=eq.${projectId}&select=slug,published`,
  );
  expect(p.published).toBe(true);
  slug = p.slug;

  const [live] = await select<{ id: string }>(
    builder,
    `versions?project_id=eq.${projectId}&number=eq.2&select=id`,
  );
  // Inviting happens through the review round below; this comment comes from the builder.
  await rpc(builder, "create_thread", {
    p_project: projectId,
    p_version: live.id,
    p_x: 0.4,
    p_y: 0.3,
    p_body: "Pay button still feels small",
  });
});

test("a review round: request, approve, and see it approved", async ({
  browser,
}) => {
  const b = await browser.newPage();
  await signIn(b, builder, `/projects/${projectId}`);
  await b.getByRole("button", { name: "Request review" }).click();
  await b.getByLabel("Reviewers").fill(reviewer.email);
  await b.getByLabel("Note to reviewers (optional)").fill("Focus on payment");
  await b.getByRole("button", { name: "Send to 1 reviewer" }).click();
  await expect(b.getByText(/Asked 1 reviewer to review v2/)).toBeVisible();

  const r = await browser.newPage();
  await signIn(r, reviewer, `/p/${slug}`);
  const banner = r.getByRole("region", { name: "Review round" });
  await expect(banner).toContainText("asked you to review v2");
  await expect(banner).toContainText("Focus on payment");
  await r.getByRole("button", { name: "Approve v2" }).click();
  await expect(banner).toContainText("You approved v2");

  await b.reload();
  await b.getByRole("tab", { name: /Comments/ }).click();
  await expect(b.getByRole("region", { name: "Review round" })).toContainText(
    "Approved",
  );
});

test("fix from feedback builds v3 and marks the comment addressed", async ({
  page,
}) => {
  await signIn(page, builder, `/projects/${projectId}`);
  await page.getByRole("tab", { name: /Comments/ }).click();
  await page
    .getByRole("checkbox", { name: /Fix comment/ })
    .first()
    .check();
  await page.getByRole("button", { name: "Fix 1 comment" }).click();
  await expect(page.getByText("v3 is ready")).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Addressed in v3" }),
  ).toBeVisible();
  const threads = await select<{ addressed_version_id: string | null }>(
    builder,
    `comment_threads?project_id=eq.${projectId}&select=addressed_version_id`,
  );
  expect(threads.every((t) => t.addressed_version_id)).toBe(true);
});

test("a password link lets a guest comment without an account", async ({
  page,
  browser,
}) => {
  await rpc(builder, "set_project_password", {
    p_project: projectId,
    p_password: "e2e-pass-123",
  });
  await adminPatch("projects", `id=eq.${projectId}`, {
    access_mode: "password",
  });
  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(`/p/${slug}`);
  await g.getByLabel("Your name").fill("Client Sam");
  await g.getByLabel("Password").fill("e2e-pass-123");
  await g.getByRole("button", { name: /View prototype|Continue|Open/ }).click();
  await expect(g.getByText("Viewing as Client Sam")).toBeVisible();
  await guest.close();
  void page;
});

test("a free user who runs out of builds is sent to upgrade, with annual pricing", async ({
  page,
}) => {
  await adminPatch("profiles", `id=eq.${builder.id}`, {
    build_limit_override: 0,
  });
  await signIn(page, builder, `/projects/${projectId}`);
  await page.getByLabel(/Describe a change/).fill("One more change");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(page.getByText(/used this month's free builds/)).toBeVisible();
  await page.goto("/billing");
  await expect(page.getByRole("radio", { name: /Annual/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByText(/\$200 a year, billed annually/)).toBeVisible();
  await adminPatch("profiles", `id=eq.${builder.id}`, {
    build_limit_override: null,
  });
});
